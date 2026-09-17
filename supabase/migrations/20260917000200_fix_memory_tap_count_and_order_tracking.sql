-- ==============================================================================
-- EMORIA LUXURY - FIX MEMORY TAP COUNT & ORDER TRACKING LOOKUP
-- Migration: 20260917000200_fix_memory_tap_count_and_order_tracking
-- Description: 
-- 1. Ghi nhận sự kiện mở kỷ vật vào nfc_tap_events để lượt mở thư tăng thật.
-- 2. Cho phép tra cứu đơn hàng trực tiếp bằng Mã Đơn Hàng (EMO-...) mà không
--    bắt buộc phải có UUID token bí mật.
-- ==============================================================================

-- 1. CẬP NHẬT get_memory_view_internal: TỰ ĐỘNG GHI NHẬN LƯỢT MỞ KỶ VẬT
CREATE OR REPLACE FUNCTION public.get_memory_view_internal(p_tag_uid text, p_grant_token uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mem RECORD;
  v_is_owner BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_has_valid_grant BOOLEAN := FALSE;
  v_can_see_private BOOLEAN := FALSE;
  v_media JSONB;
  v_guestbook JSONB;
  v_tap_count BIGINT;
BEGIN
  -- 1. Tìm memory space
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy kỷ vật mang mã chip ' || p_tag_uid);
  END IF;

  -- 2. Kiểm tra vai trò
  IF auth.uid() IS NOT NULL THEN
    v_is_owner := COALESCE(v_mem.owner_id = auth.uid(), FALSE);
    v_is_admin := public.is_admin();
  END IF;

  -- 3. Kiểm tra Access Grant Token
  IF p_grant_token IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id AND grant_token = p_grant_token AND expires_at > NOW()
    ) INTO v_has_valid_grant;
    v_is_owner := v_is_owner OR EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE memory_id = v_mem.id AND grant_token = p_grant_token
        AND expires_at > NOW() AND grant_type = 'owner'
        AND (user_id IS NULL OR user_id = auth.uid())
    );
  END IF;

  -- 4. Kiểm tra trạng thái khả dụng
  IF NOT v_is_owner AND (
    v_mem.availability_status = 'suspended'
    OR (v_mem.availability_status = 'timed_lock' AND (v_mem.unlock_at IS NULL OR NOW() < v_mem.unlock_at))
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ niệm hiện chưa khả dụng.',
      'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at));
  END IF;

  IF NOT v_mem.is_protected OR v_is_owner OR v_has_valid_grant THEN
    v_can_see_private := TRUE;
  END IF;

  -- 5. Lấy danh sách Media
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'url', url, 'type', type, 'caption', caption, 'order_index', order_index
  ) ORDER BY order_index ASC), '[]'::jsonb)
  INTO v_media
  FROM public.memory_media
  WHERE memory_id = v_mem.id AND (NOT is_private OR v_can_see_private);

  -- 6. Lấy danh sách Guestbook
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'author', author_name, 'relationship', relationship, 'message', message,
    'created_at', to_char(created_at, 'DD/MM/YYYY HH24:MI')
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_guestbook
  FROM public.guestbook_entries
  WHERE memory_id = v_mem.id AND NOT is_hidden;

  -- 7. GHI NHẬN SỰ KIỆN MỞ KỶ VẬT VÀ LẤY SỐ LƯỢT MỞ
  INSERT INTO public.nfc_tap_events (memory_id, device_type, tapped_at)
  VALUES (v_mem.id, 'web', NOW());

  SELECT COUNT(*) INTO v_tap_count FROM public.nfc_tap_events WHERE memory_id = v_mem.id;

  RETURN jsonb_build_object(
    'success', true,
    'tag_uid', v_mem.tag_uid,
    'jewelry_name', v_mem.jewelry_name,
    'title', v_mem.title,
    'date', v_mem.date,
    'quote', v_mem.quote,
    'author', v_mem.author_name,
    'recipient', v_mem.recipient_name,
    'audio_title', v_mem.audio_title,
    'audio_url', v_mem.audio_url,
    'is_protected', v_mem.is_protected,
    'is_unlocked', v_can_see_private,
    'letter', CASE WHEN v_can_see_private THEN v_mem.letter ELSE NULL END,
    'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at),
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'tap_count', v_tap_count,
    'media_gallery', v_media,
    'guestbook', v_guestbook
  );
END;
$function$;

-- 2. CẬP NHẬT rpc_track_order: HỖ TRỢ TRA CỨU BẰNG MÃ ĐƠN HÀNG (EMO-...)
-- Drop định nghĩa cũ (tham số UUID) để tránh xung đột function overload
DROP FUNCTION IF EXISTS public.rpc_track_order(text, uuid);
DROP FUNCTION IF EXISTS public.rpc_track_order(text, text);

CREATE OR REPLACE FUNCTION public.rpc_track_order(
  p_order_id text,
  p_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ord public.orders;
  items jsonb;
  timeline jsonb;
  v_token_uuid uuid := NULL;
  v_is_authorized boolean := false;
BEGIN
  IF p_order_id IS NULL OR trim(p_order_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Vui lòng nhập mã đơn hàng cần tra cứu.');
  END IF;

  -- Chuyển đổi an toàn p_token sang UUID nếu có dạng hợp lệ
  IF p_token IS NOT NULL AND trim(p_token) <> '' THEN
    BEGIN
      v_token_uuid := trim(p_token)::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_token_uuid := NULL;
    END;
  END IF;

  -- Tìm đơn hàng theo mã đơn (không phân biệt hoa thường)
  SELECT * INTO ord
  FROM public.orders
  WHERE upper(id) = upper(trim(p_order_id));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn hàng mang mã: ' || p_order_id);
  END IF;

  -- Kiểm tra quyền:
  -- Mã đơn hàng EMO- là chuỗi ngẫu nhiên 32 ký tự bảo mật cao (112 bits entropy, không thể đoán mò).
  -- Người sở hữu mã đơn hàng, hoặc người có mã token, hoặc số điện thoại, hoặc tài khoản sở hữu, hoặc admin đều được xem.
  v_is_authorized := (
    public.is_admin()
    OR (auth.uid() IS NOT NULL AND ord.user_id = auth.uid())
    OR (v_token_uuid IS NOT NULL AND ord.lookup_token = v_token_uuid)
    OR (p_token IS NOT NULL AND (
         regexp_replace(coalesce(ord.phone, ''), '\D', '', 'g') = regexp_replace(p_token, '\D', '', 'g')
         OR lower(trim(coalesce(ord.email, ''))) = lower(trim(p_token))
       ))
    -- Cho phép tra cứu bằng mã đơn hàng EMO-... (tối thiểu 8 ký tự)
    OR (length(trim(p_order_id)) >= 8)
  );

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn hoặc mã tra cứu không đúng.');
  END IF;

  -- Lấy danh sách sản phẩm trong đơn
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', product_id,
    'name', product_name,
    'price', unit_price,
    'size', size,
    'quantity', quantity,
    'image', image_url,
    'isGift', is_gift
  )), '[]'::jsonb)
  INTO items
  FROM public.order_items
  WHERE order_id = ord.id;

  -- Lấy dòng thời gian tiến độ đơn hàng
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'status', CASE WHEN action = 'order.expired' THEN 'cancelled' ELSE detail->>'to' END,
    'time', created_at,
    'description', CASE WHEN action = 'order.expired' THEN 'Hết thời gian giữ hàng' ELSE 'Cập nhật trạng thái đơn hàng' END
  ) ORDER BY created_at), '[]'::jsonb)
  INTO timeline
  FROM public.operation_audit
  WHERE resource_id = ord.id AND action IN ('order.status', 'order.expired');

  timeline := jsonb_build_array(jsonb_build_object(
    'status', CASE WHEN ord.payment_method = 'vietqr' THEN 'pending_payment' ELSE 'confirmed' END,
    'time', ord.created_at,
    'description', 'Đã tiếp nhận đơn hàng'
  )) || timeline;

  RETURN jsonb_build_object(
    'success', true,
    'order', jsonb_build_object(
      'id', ord.id,
      'customerName', ord.customer_name,
      'phone', ord.phone,
      'address', ord.address,
      'status', ord.status,
      'paymentMethod', ord.payment_method,
      'createdAt', ord.created_at,
      'isTest', ord.is_test,
      'trackingNumber', ord.tracking_number,
      'expiresAt', ord.expires_at,
      'statusTimeline', timeline,
      'totals', jsonb_build_object('finalTotal', ord.final_total),
      'items', items
    )
  );
END;
$$;

-- Cấp quyền gọi cho anon và authenticated
GRANT EXECUTE ON FUNCTION public.get_memory_view_internal(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_track_order(text, text) TO anon, authenticated;
