/**
 * EMORIA LUXURY - DỊCH VỤ BÀI VIẾT, BÌNH LUẬN & TƯƠNG TÁC (ARTICLE SERVICE)
 * Tích hợp Supabase RPC và bảo vệ dữ liệu với fallback chuẩn Dark Luxury khi offline.
 */
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

// Dữ liệu dự phòng phong phú và sang trọng khi chưa kết nối Supabase Cloud
export const DEMO_ARTICLES = [
  {
    id: 'art-001',
    slug: 'nghe-thuat-che-tac-da-quy-emoria',
    title: 'Nghệ Thuật Chế Tác Kim Hoàn & Đá Quý Tại Xưởng Kỷ Niệm EMORIA',
    excerpt: 'Hành trình kỳ công biến những khối đá quý tự nhiên và hợp kim titan cao cấp thành tác phẩm lưu giữ ký ức vĩnh cửu.',
    content: `Trong thế giới của sự xa xỉ đương đại, trang sức không chỉ đơn thuần là món đồ trang trí lộng lẫy, mà còn là vật chứng thiêng liêng lưu dấu những khoảnh khắc đẹp đẽ nhất của đời người.

Tại EMORIA Atelier, mỗi chiếc nhẫn thông minh không bắt đầu từ dây chuyền sản xuất hàng loạt, mà bắt đầu từ những bản phác thảo tay của nghệ nhân kim hoàn. Chúng tôi tuyển chọn những khối đá cubic zirconia hạng AAAAA và đá quý thiên nhiên có độ tán sắc hoàn hảo, sau đó cắt mài giác vát thủ công để đạt độ lấp lánh đỉnh cao dưới mọi góc ánh sáng.

### Sự Hòa Quyện Giữa Kim Hoàn Cổ Điển Và Vi Mạch Tiên Tiến
Thách thức lớn nhất trong quá trình chế tác là việc tích hợp cụm vi mạch NFC thế hệ mới vào bên trong lòng nhẫn kim loại quý mà không làm suy giảm tín hiệu trường điện từ, đồng thời giữ nguyên trọng lượng thanh thoát và cảm giác đeo êm ái như tơ lụa.

Mỗi chiếc nhẫn phải trải qua 48 giờ nung áp suất chân không và 12 bước đánh bóng bằng bột kim cương vi hạt. Đó là lý do vì sao khi chạm nhẹ nhẫn vào điện thoại, một không gian kỷ niệm sống động sẽ mở ra – nơi tình yêu, lời hẹn ước và ký ức được bảo bọc trọn vẹn suốt hàng trăm năm.`,
    cover_image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1200&q=80',
    category: 'Chế tác & Nghệ thuật',
    tags: ['Chế tác thủ công', 'Kim hoàn cao cấp', 'Đá quý', 'Atelier'],
    author_name: 'EMORIA Atelier',
    status: 'published',
    published_at: '2026-09-10T08:00:00Z',
    view_count: 1420,
    likes_count: 89,
    related_product_ids: ['emoria-pulse', 'emoria-lumen'],
    allow_comments: true,
  },
  {
    id: 'art-002',
    slug: 'bi-mat-cong-nghe-nfc-trang-suc-thong-minh',
    title: 'Bí Mật Công Nghệ NFC: Khi Trang Sức Trở Thành Chiếc Hòm Kỷ Niệm Số',
    excerpt: 'Giải mã cách thức sóng trường gần NFC bảo vệ sự riêng tư tuyệt đối cho không gian kỷ niệm mà không cần sạc pin.',
    content: `Khác biệt hoàn toàn với những thiết bị công nghệ đeo thông thường phải sạc pin mỗi ngày hay phát ra bức xạ sóng liên tục, nhẫn thông minh EMORIA vận hành dựa trên nguyên lý cảm ứng thụ động (Passive RFID/NFC).

### Không Cần Pin - Bền Bỉ Cùng Năm Tháng
Bên trong mỗi chiếc nhẫn EMORIA là ăng-ten siêu mỏng bằng đồng nguyên chất dát phẳng, được nuôi nguồn tức thì nhờ sóng cảm ứng vô tuyến phát ra từ điện thoại của chủ nhân. Điều này đồng nghĩa với việc chiếc nhẫn không bao giờ cạn kiệt năng lượng, không bao giờ cần cắm sạc, và có thể đồng hành cùng bạn suốt cả một đời người.

### Mã Hóa Kép Và Quyền Riêng Tư Tối Thượng
Mỗi chip mang một mã UID độc nhất vô nhị toàn cầu do tổ chức quốc tế cấp phát. Dữ liệu kỷ niệm của bạn được bảo vệ qua hai lớp rào chắn:
1. **Lớp vật lý:** Cần sự tiếp xúc vật lý cự ly gần (< 2cm).
2. **Lớp mật mã:** Mã PIN bí mật 4-6 số do chủ nhân tự thiết lập, ngăn chặn hoàn toàn mọi nỗ lực quét trộm từ người lạ.

Kỷ niệm là điều quý giá nhất, và sự riêng tư là nguyên tắc bất di bất dịch của EMORIA.`,
    cover_image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&q=80',
    category: 'Công nghệ & NFC',
    tags: ['NFC', 'Bảo mật', 'Công nghệ đeo', 'Kỷ niệm số'],
    author_name: 'Ban Đổi Mới Công Nghệ EMORIA',
    status: 'published',
    published_at: '2026-09-12T14:30:00Z',
    view_count: 980,
    likes_count: 64,
    related_product_ids: ['emoria-horizon', 'emoria-halo'],
    allow_comments: true,
  },
  {
    id: 'art-003',
    slug: 'bo-suu-tap-celestial-duo-tinh-yeu-vinh-cuu',
    title: 'Bộ Sưu Tập Celestial Duo: Biểu Tượng Của Tình Yêu Vượt Không Gian',
    excerpt: 'Hai tâm hồn, một tần số gắn kết. Khám phá cặp nhẫn đôi thông minh nối liền hai không gian kỷ niệm song hành.',
    content: `Có những câu chuyện tình yêu đẹp đến mức thời gian và khoảng cách địa lý cũng không thể làm phai mờ. Bộ sưu tập Celestial Duo ra đời nhằm tôn vinh những mối liên kết diệu kỳ như thế.

Được thiết kế theo cặp tương hỗ nhau – một chiếc mang sắc đen huyền bí của bầu trời đêm (Cosmic Black), chiếc còn lại mang ánh bạc thuần khiết của ánh trăng (Lunar Silver). Khi hai chiếc nhẫn được đặt cạnh nhau, các vi mạch tạo thành một liên kết đồng bộ, cho phép cả hai chủ nhân cùng chia sẻ và cập nhật một dòng thời gian kỷ niệm chung.

Dù bạn đang ở Paris và người ấy đang ở Tokyo, chỉ cần chạm nhẹ nhẫn vào điện thoại, bạn sẽ lập tức nhìn thấy những bức ảnh mới nhất, những lá thư bí mật và những bài ca mà cả hai cùng yêu thích.`,
    cover_image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1200&q=80',
    category: 'Phong cách sống',
    tags: ['Nhẫn đôi', 'Tình yêu', 'Celestial Duo', 'Quà tặng'],
    author_name: 'EMORIA Curation',
    status: 'published',
    published_at: '2026-09-13T09:15:00Z',
    view_count: 2150,
    likes_count: 142,
    related_product_ids: ['emoria-celestial-duo'],
    allow_comments: true,
  },
  {
    id: 'art-004',
    slug: 'huong-dan-cham-soc-va-bao-quan-nhan-thong-minh',
    title: 'Cẩm Nang Bảo Dưỡng Và Kích Hoạt Trang Sức Kỷ Niệm EMORIA',
    excerpt: 'Những lưu ý quan trọng để chiếc nhẫn luôn sáng bóng như mới và chip NFC hoạt động ổn định trong mọi điều kiện.',
    content: `Để món trang sức EMORIA luôn gìn giữ được độ bóng sáng sang trọng và độ bền vượt trội qua năm tháng, quý khách vui lòng lưu ý một số chỉ dẫn chăm sóc chuyên biệt từ các nghệ nhân của chúng tôi:

1. **Vệ sinh định kỳ:** Sử dụng khăn nhung mịn đi kèm trong hộp sang trọng để lau nhẹ bề mặt đá và vỏ kim loại sau mỗi lần đeo.
2. **Tránh hóa chất nồng độ cao:** Không ngâm nhẫn trong dung dịch axit mạnh hoặc chất tẩy rửa gia dụng. Khi bơi tại bể bơi có clo đậm đặc hoặc tắm khoáng nóng, nên tháo nhẫn để bảo vệ lớp mạ bảo vệ.
3. **Chống xước bề mặt:** Khi không sử dụng, hãy cất nhẫn vào ngăn nhung riêng biệt trong hộp Memory Box để tránh va quẹt với các trang sức kim cương khác.
4. **Kích hoạt NFC:** Chỉ cần chạm nhẹ mặt lưng điện thoại (vùng đặt cảm biến NFC) vào mặt trên của viên đá quý trong khoảng 1-2 giây cho đến khi có thông báo rung nhẹ.`,
    cover_image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&q=80',
    category: 'Hướng dẫn',
    tags: ['Hướng dẫn sử dụng', 'Bảo quản', 'Kim hoàn', 'NFC Setup'],
    author_name: 'Dịch Vụ Khách Hàng EMORIA',
    status: 'published',
    published_at: '2026-09-14T03:00:00Z',
    view_count: 730,
    likes_count: 45,
    related_product_ids: ['emoria-solaris-keyring'],
    allow_comments: true,
  }
];

export const DEMO_COMMENTS = {
  'art-001': [
    {
      id: 'comm-1',
      parent_id: null,
      author_name: 'Trần Minh Hoàng',
      author_avatar: null,
      content: 'Thiết kế nhẫn thực sự rất tinh xảo, tôi đã mua tặng vợ nhân dịp kỷ niệm 5 năm ngày cưới và cô ấy vô cùng xúc động khi chạm vào chiếc nhẫn để xem lại video ngày cưới.',
      status: 'approved',
      created_at: '12/09/2026 10:20',
      is_mine: false,
    },
    {
      id: 'comm-2',
      parent_id: 'comm-1',
      author_name: 'EMORIA Atelier',
      author_avatar: null,
      content: 'Chân thành cảm ơn anh Hoàng. Hạnh phúc của quý khách chính là nguồn cảm hứng lớn nhất để đội ngũ nghệ nhân EMORIA tiếp tục sáng tạo!',
      status: 'approved',
      created_at: '12/09/2026 11:05',
      is_mine: false,
    },
    {
      id: 'comm-3',
      parent_id: null,
      author_name: 'Nguyễn Bích Phương',
      author_avatar: null,
      content: 'Chất liệu bạc và đá quý nung chân không thực tế dùng hàng ngày có dễ xước không ạ?',
      status: 'approved',
      created_at: '13/09/2026 15:40',
      is_mine: false,
    }
  ]
};

/**
 * Lấy danh sách bài viết đã xuất bản
 */
export async function getPublishedArticles({ category = null, search = null, limit = 10, offset = 0 } = {}) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_get_published_articles', {
        p_category: category,
        p_search: search,
        p_limit: limit,
        p_offset: offset,
      });

      if (!error && data && data.success && Array.isArray(data.articles) && data.articles.length > 0) {
        return {
          success: true,
          total: data.total,
          articles: data.articles,
          isFallback: false,
        };
      }
    } catch (err) {
      console.warn('Supabase rpc_get_published_articles call error, falling back to demo:', err);
    }
  }

  // Fallback lọc dữ liệu demo
  let filtered = [...DEMO_ARTICLES];
  if (category && category !== 'Tất cả') {
    filtered = filtered.filter(a => a.category === category);
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(a => 
      a.title.toLowerCase().includes(q) || 
      a.excerpt.toLowerCase().includes(q) ||
      a.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  const paginated = filtered.slice(offset, offset + limit);
  return {
    success: true,
    total: filtered.length,
    articles: paginated,
    isFallback: true,
  };
}

/**
 * Lấy chi tiết bài viết theo Slug
 */
export async function getArticleDetail(slug) {
  if (!slug) return { success: false, message: 'Slug không hợp lệ' };

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_get_article_detail', {
        p_slug: slug,
      });

      if (!error && data && data.success && data.article) {
        return {
          success: true,
          article: data.article,
          comments: data.comments || [],
          isFallback: false,
        };
      }
    } catch (err) {
      console.warn('Supabase rpc_get_article_detail call error, falling back to demo:', err);
    }
  }

  // Fallback demo
  const found = DEMO_ARTICLES.find(a => a.slug === slug);
  if (!found) {
    return { success: false, message: 'Không tìm thấy bài viết' };
  }

  const comments = DEMO_COMMENTS[found.id] || [];
  return {
    success: true,
    article: {
      ...found,
      is_liked: false,
      is_bookmarked: false,
    },
    comments,
    isFallback: true,
  };
}

/**
 * Thích / Bỏ thích bài viết
 */
export async function toggleArticleLike(articleId) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_toggle_article_like', {
        p_article_id: articleId,
      });
      if (!error && data) {
        return data;
      }
      if (error) {
        return { success: false, message: error.message };
      }
    } catch (err) {
      console.warn('toggleArticleLike error:', err);
    }
  }

  // Demo fallback state in memory / local session
  return {
    success: true,
    is_liked: true,
    likes_count: 90,
    isFallback: true,
  };
}

/**
 * Lưu / Bỏ lưu bài viết (Bookmark)
 */
export async function toggleArticleBookmark(articleId) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_toggle_article_bookmark', {
        p_article_id: articleId,
      });
      if (!error && data) {
        return data;
      }
      if (error) {
        return { success: false, message: error.message };
      }
    } catch (err) {
      console.warn('toggleArticleBookmark error:', err);
    }
  }

  return {
    success: true,
    is_bookmarked: true,
    message: 'Đã lưu bài viết vào mục yêu thích.',
    isFallback: true,
  };
}

/**
 * Gửi bình luận hoặc phản hồi 1 cấp
 */
export async function addArticleComment({ articleId, content, parentId = null }) {
  if (!content || !content.trim()) {
    return { success: false, message: 'Vui lòng nhập nội dung bình luận.' };
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_add_article_comment', {
        p_article_id: articleId,
        p_content: content.trim(),
        p_parent_id: parentId,
      });
      if (!error && data) {
        return data;
      }
      if (error) {
        return { success: false, message: error.message };
      }
    } catch (err) {
      console.warn('addArticleComment error:', err);
    }
  }

  // Fallback demo
  return {
    success: true,
    comment_id: 'comm-temp-' + Date.now(),
    status: 'pending',
    message: 'Bình luận của quý khách đã được gửi và đang chờ ban biên tập duyệt.',
    isFallback: true,
  };
}

/**
 * Admin: Duyệt bình luận (approved, hidden, deleted)
 */
export async function moderateArticleComment(commentId, status) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_moderate_article_comment', {
        p_comment_id: commentId,
        p_status: status,
      });
      if (!error && data) {
        return data;
      }
      if (error) {
        return { success: false, message: error.message };
      }
    } catch (err) {
      console.warn('moderateArticleComment error:', err);
    }
  }

  return {
    success: true,
    message: `Đã cập nhật trạng thái bình luận thành: ${status}`,
    isFallback: true,
  };
}

/**
 * Admin: Tạo hoặc cập nhật bài viết
 */
export async function saveArticleAdmin({ articleId = null, payload }) {
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.rpc('rpc_save_article_admin', {
        p_article_id: articleId,
        p_payload: payload,
      });
      if (!error && data) {
        return data;
      }
      if (error) {
        return { success: false, message: error.message };
      }
    } catch (err) {
      console.warn('saveArticleAdmin error:', err);
    }
  }

  return {
    success: true,
    article_id: articleId || 'art-temp-' + Date.now(),
    slug: payload.slug,
    status: payload.status,
    message: 'Đã lưu bài viết thành công (Chế độ xem trước).',
    isFallback: true,
  };
}
