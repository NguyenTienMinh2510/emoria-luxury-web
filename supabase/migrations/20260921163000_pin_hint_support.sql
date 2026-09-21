-- Migration: Add pin_hint support to memory_spaces, update_memory_internal, and get_memory_view_internal

ALTER TABLE public.memory_spaces ADD COLUMN IF NOT EXISTS pin_hint text DEFAULT NULL;

-- Cập nhật update_memory_internal để lưu/xóa pin_hint
CREATE OR REPLACE FUNCTION public.update_memory_internal(p_tag_uid text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_mem RECORD;
  v_pin_action TEXT;
  v_new_pin TEXT;
  v_new_pin_hash TEXT;
  v_new_pin_hint TEXT;
BEGIN
  SELECT * INTO v_mem FROM public.memory_spaces WHERE tag_uid = lower(trim(p_tag_uid));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kỷ vật không tồn tại.');
  END IF;

  IF NOT (COALESCE(v_mem.owner_id = auth.uid(), FALSE) OR public.is_admin()) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Từ chối quyền: Bạn không phải là chủ nhân hoặc quản trị viên của kỷ vật này.');
  END IF;

  v_pin_action := p_payload->>'pin_action';
  v_new_pin := p_payload->>'pin_code';
  v_new_pin_hash := v_mem.pin_hash;
  v_new_pin_hint := v_mem.pin_hint;

  IF v_pin_action = 'SET' AND v_new_pin IS NOT NULL AND length(trim(v_new_pin)) >= 4 THEN
    v_new_pin_hash := crypt(trim(v_new_pin), gen_salt('bf', 10));
    v_mem.is_protected := TRUE;
    v_new_pin_hint := nullif(trim(coalesce(p_payload->>'pin_hint', '')), '');
  ELSIF v_pin_action = 'REMOVE' THEN
    v_new_pin_hash := NULL;
    v_mem.is_protected := FALSE;
    v_new_pin_hint := NULL;
  ELSIF p_payload ? 'pin_hint' THEN
    v_new_pin_hint := nullif(trim(p_payload->>'pin_hint'), '');
  END IF;

  IF v_new_pin_hash IS DISTINCT FROM v_mem.pin_hash THEN
    DELETE FROM public.access_grants WHERE memory_id = v_mem.id AND grant_type = 'viewer';
  END IF;

  UPDATE public.memory_spaces SET
    title = COALESCE(nullif(trim(p_payload->>'title'), ''), title),
    quote = COALESCE(p_payload->>'quote', quote),
    letter = COALESCE(p_payload->>'letter', letter),
    author_name = COALESCE(nullif(trim(p_payload->>'author'), ''), author_name),
    recipient_name = COALESCE(nullif(trim(p_payload->>'recipient'), ''), recipient_name),
    audio_title = COALESCE(p_payload->>'audio_title', audio_title),
    audio_url = COALESCE(p_payload->>'audio_url', audio_url),
    is_protected = v_mem.is_protected,
    pin_hash = v_new_pin_hash,
    pin_hint = v_new_pin_hint,
    updated_at = NOW()
  WHERE id = v_mem.id;

  RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thành công.');
END;
$$;

-- Cập nhật get_memory_view_internal để trả về pin_hint an toàn khi kỷ vật bị khóa
CREATE OR REPLACE FUNCTION public.get_memory_view_internal(p_tag_uid text, p_grant_token uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_mem RECORD;
  v_is_owner BOOLEAN := FALSE;
  v_is_admin BOOLEAN := FALSE;
  v_is_recipient BOOLEAN := FALSE;
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
    v_is_recipient := EXISTS(SELECT 1 FROM public.memory_recipients r WHERE r.memory_id = v_mem.id AND r.user_id = auth.uid());
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

  IF NOT v_mem.is_protected OR v_is_owner OR v_has_valid_grant OR v_is_recipient THEN
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

  -- 7. Ghi nhận sự kiện mở kỷ vật
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
    'pin_hint', CASE WHEN v_mem.is_protected AND v_mem.pin_hint IS NOT NULL AND length(trim(v_mem.pin_hint)) > 0 THEN v_mem.pin_hint ELSE NULL END,
    'is_unlocked', v_can_see_private,
    'letter', CASE WHEN v_can_see_private THEN v_mem.letter ELSE NULL END,
    'availability', jsonb_build_object('status', v_mem.availability_status, 'unlock_date', v_mem.unlock_at),
    'is_owner', v_is_owner,
    'is_admin', v_is_admin,
    'is_recipient', v_is_recipient,
    'tap_count', v_tap_count,
    'media_gallery', v_media,
    'guestbook', v_guestbook
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_memory_view_internal(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_memory_view_internal(text, uuid) TO anon, authenticated;
