// File cấu hình mẫu bố cục (Layout Presets) chuẩn cho House Studio
// Hỗ trợ cả Preset toàn ngôi nhà lẫn Preset riêng lẻ cho từng phòng.
// Mỗi preset là dữ liệu tĩnh, bài trí tự nhiên, tối ưu hiệu năng và bảo toàn 100% ảnh kỷ niệm.

export const ROOM_PRESETS = {
  beginning: [
    {
      id: 'cozy',
      name: 'Cozy Dịu Êm',
      icon: '✨',
      description: 'Ghế gỗ, thảm cúc, capybara, mèo con và đèn quả lê ấm áp',
      decorations: [
        { id: 'p_cozy_beg_chair', item: 'chair', surface: 'floor', position: [-3.6, 0.142, -0.55], rotation: -12, scale: 1 },
        { id: 'p_cozy_beg_rug', item: 'daisy-rug', surface: 'floor', position: [-2.6, 0.142, 0.45], rotation: 0, scale: 1 },
        { id: 'p_cozy_beg_capy', item: 'capybara', surface: 'floor', position: [-2.485, 0.173, 0.869], rotation: 0, scale: 0.9, parent_id: 'p_cozy_beg_rug' },
        { id: 'p_cozy_beg_cat', item: 'cat', surface: 'floor', position: [-2.997, 0.173, 0.348], rotation: 0, scale: 0.65, parent_id: 'p_cozy_beg_rug' },
        { id: 'p_cozy_beg_cubby', item: 'cubby', surface: 'floor', position: [-2.25, 0.142, -0.64], rotation: 0, scale: 0.55 },
        { id: 'p_cozy_beg_lamp', item: 'pear-lamp', surface: 'table', position: [-2.25, 0.558, -0.64], rotation: 0, scale: 0.8, parent_id: 'p_cozy_beg_cubby' }
      ]
    },
    {
      id: 'vintage',
      name: 'Vintage Hoài Niệm',
      icon: '🎞️',
      description: 'Ghế gỗ mộc cổ điển, chậu cây xanh, mèo nhỏ và khung ảnh kỷ niệm',
      decorations: [
        { id: 'p_vnt_beg_chair', item: 'chair', surface: 'floor', position: [-3.4, 0.142, -0.45], rotation: -10, scale: 1 },
        { id: 'p_vnt_beg_plant', item: 'plant', surface: 'floor', position: [-2.1, 0.142, -0.6], rotation: 0, scale: 0.9 },
        { id: 'p_vnt_beg_cat', item: 'cat', surface: 'floor', position: [-2.8, 0.142, 0.35], rotation: 15, scale: 0.7 },
        { id: 'p_vnt_beg_frame', item: 'frame', surface: 'wall', position: [-2.7, 1.2, -1.04], rotation: 0, scale: 0.7 }
      ]
    },
    {
      id: 'minimalist',
      name: 'Minimalist Tinh Tế',
      icon: '🌿',
      description: 'Ghế bành tối giản, chậu cây thanh lọc, đệm ngồi êm ái',
      decorations: [
        { id: 'p_min_beg_chair', item: 'chair', surface: 'floor', position: [-2.8, 0.142, -0.4], rotation: 0, scale: 1 },
        { id: 'p_min_beg_plant', item: 'plant', surface: 'floor', position: [-3.5, 0.142, -0.5], rotation: 0, scale: 0.9 },
        { id: 'p_min_beg_cushion', item: 'cushion', surface: 'floor', position: [-2.0, 0.142, 0.3], rotation: 0, scale: 0.8 }
      ]
    },
    {
      id: 'sweet',
      name: 'Ngọt Ngào Đón Chào',
      icon: '🌸',
      description: 'Khung ảnh đón chào, thỏ bông, đèn đám mây và thảm cúc',
      decorations: [
        { id: 'p_swt_beg_rug', item: 'daisy-rug', surface: 'floor', position: [-2.8, 0.142, 0.4], rotation: 0, scale: 1 },
        { id: 'p_swt_beg_rabbit', item: 'rabbit', surface: 'floor', position: [-2.6, 0.173, 0.8], rotation: 0, scale: 1.1, parent_id: 'p_swt_beg_rug' },
        { id: 'p_swt_beg_chair', item: 'chair', surface: 'floor', position: [-3.5, 0.142, -0.5], rotation: -10, scale: 1 },
        { id: 'p_swt_beg_cubby', item: 'cubby', surface: 'floor', position: [-2.1, 0.142, -0.6], rotation: 0, scale: 0.6 },
        { id: 'p_swt_beg_cloud', item: 'cloud-lamp', surface: 'table', position: [-2.1, 0.6, -0.6], rotation: 0, scale: 0.8, parent_id: 'p_swt_beg_cubby' },
        { id: 'p_swt_beg_frame', item: 'frame', surface: 'wall', position: [-2.8, 1.25, -1.04], rotation: 0, scale: 0.7 }
      ]
    }
  ],
  first: [
    {
      id: 'cozy',
      name: 'Bistro Cozy',
      icon: '☕',
      description: 'Bàn bistro tròn, cặp đệm ngồi, chú cún Shiba, tách trà và nến mật ong',
      decorations: [
        { id: 'p_cozy_fst_table', item: 'bistro-table', surface: 'floor', position: [0.12, 0.142, -0.28], rotation: -8, scale: 1 },
        { id: 'p_cozy_fst_cush_l', item: 'cushion', surface: 'floor', position: [-0.75, 0.142, 0.48], rotation: 0, scale: 0.8 },
        { id: 'p_cozy_fst_cush_r', item: 'cushion', surface: 'floor', position: [0.78, 0.142, 0.68], rotation: 0, scale: 0.8 },
        { id: 'p_cozy_fst_shiba', item: 'shiba', surface: 'floor', position: [0.704, 0.142, 0.227], rotation: 0, scale: 0.85 },
        { id: 'p_cozy_fst_mugs', item: 'mugs', surface: 'table', position: [-0.2, 0.776, -0.3], rotation: 0, scale: 0.65, parent_id: 'p_cozy_fst_table' },
        { id: 'p_cozy_fst_jam', item: 'mugs-jam', surface: 'table', position: [0.38, 0.776, -0.13], rotation: 14, scale: 0.65, parent_id: 'p_cozy_fst_table' },
        { id: 'p_cozy_fst_shelf', item: 'shelf', surface: 'wall', position: [-0.8, 0.83, -1.031], rotation: 0, scale: 0.6 },
        { id: 'p_cozy_fst_candle', item: 'honey-candle', surface: 'shelf', position: [-0.8, 0.966, -1.031], rotation: 0, scale: 0.65, parent_id: 'p_cozy_fst_shelf' }
      ]
    },
    {
      id: 'vintage',
      name: 'Trà Chiều Cổ Điển',
      icon: '🪑',
      description: 'Bàn gỗ tròn, cặp ghế tựa mộc, bình hoa và tách trà hoài cổ',
      decorations: [
        { id: 'p_vnt_fst_table', item: 'bistro-table', surface: 'floor', position: [0.0, 0.142, -0.2], rotation: 0, scale: 1 },
        { id: 'p_vnt_fst_chair_l', item: 'chair', surface: 'floor', position: [-0.65, 0.142, 0.2], rotation: 35, scale: 0.9 },
        { id: 'p_vnt_fst_chair_r', item: 'chair', surface: 'floor', position: [0.65, 0.142, 0.2], rotation: -35, scale: 0.9 },
        { id: 'p_vnt_fst_mugs', item: 'mugs', surface: 'table', position: [-0.15, 0.776, -0.2], rotation: 0, scale: 0.65, parent_id: 'p_vnt_fst_table' },
        { id: 'p_vnt_fst_vase', item: 'vase', surface: 'table', position: [0.15, 0.776, -0.2], rotation: 0, scale: 0.6, parent_id: 'p_vnt_fst_table' }
      ]
    },
    {
      id: 'minimalist',
      name: 'Tối Giản Thanh Lịch',
      icon: '🍃',
      description: 'Bàn trà mộc, chậu sen đá, ly gốm tối giản và kệ tường thanh mảnh',
      decorations: [
        { id: 'p_min_fst_table', item: 'bistro-table', surface: 'floor', position: [0.1, 0.142, -0.2], rotation: 0, scale: 1 },
        { id: 'p_min_fst_mugs', item: 'mugs', surface: 'table', position: [0.0, 0.776, -0.2], rotation: 0, scale: 0.65, parent_id: 'p_min_fst_table' },
        { id: 'p_min_fst_succ', item: 'succulent', surface: 'table', position: [0.25, 0.776, -0.2], rotation: 0, scale: 0.6, parent_id: 'p_min_fst_table' },
        { id: 'p_min_fst_shelf', item: 'shelf', surface: 'wall', position: [-0.6, 0.9, -1.03], rotation: 0, scale: 0.6 }
      ]
    },
    {
      id: 'romantic',
      name: 'Hẹn Hò Lãng Mạn',
      icon: '🕯️',
      description: 'Bàn nến lung linh, khung ảnh sao hẹn ước, cặp tách trà và gấu bông nhỏ',
      decorations: [
        { id: 'p_rom_fst_table', item: 'bistro-table', surface: 'floor', position: [0.0, 0.142, -0.2], rotation: 0, scale: 1 },
        { id: 'p_rom_fst_cush_l', item: 'cushion', surface: 'floor', position: [-0.7, 0.142, 0.4], rotation: 0, scale: 0.8 },
        { id: 'p_rom_fst_cush_r', item: 'cushion', surface: 'floor', position: [0.7, 0.142, 0.4], rotation: 0, scale: 0.8 },
        { id: 'p_rom_fst_star', item: 'star-frame', surface: 'table', position: [0.0, 0.776, -0.25], rotation: 0, scale: 0.7, parent_id: 'p_rom_fst_table' },
        { id: 'p_rom_fst_candle', item: 'candles', surface: 'table', position: [-0.25, 0.776, -0.15], rotation: 0, scale: 0.6, parent_id: 'p_rom_fst_table' },
        { id: 'p_rom_fst_mugs', item: 'mugs', surface: 'table', position: [0.25, 0.776, -0.15], rotation: 0, scale: 0.65, parent_id: 'p_rom_fst_table' },
        { id: 'p_rom_fst_shelf', item: 'shelf', surface: 'wall', position: [0.0, 1.05, -1.03], rotation: 0, scale: 0.6 }
      ]
    }
  ],
  'little-things': [
    {
      id: 'cozy',
      name: 'Góc Nhỏ An Yên',
      icon: '📻',
      description: 'Kệ tủ cubby gỗ, máy đĩa than, máy ảnh retro, dương xỉ và đàn vịt vàng',
      decorations: [
        { id: 'p_cozy_lt_cubby', item: 'cubby', surface: 'floor', position: [2.8, 0.142, -0.6], rotation: 0, scale: 1.25 },
        { id: 'p_cozy_lt_succulent', item: 'succulent', surface: 'table', position: [2.3, 1.083, -0.6], rotation: 0, scale: 0.8, parent_id: 'p_cozy_lt_cubby' },
        { id: 'p_cozy_lt_camera', item: 'camera', surface: 'table', position: [2.8, 1.083, -0.54], rotation: -12, scale: 0.8, parent_id: 'p_cozy_lt_cubby' },
        { id: 'p_cozy_lt_turntable', item: 'turntable', surface: 'table', position: [3.094, 0.668, -0.523], rotation: 0, scale: 0.8, parent_id: 'p_cozy_lt_cubby' },
        { id: 'p_cozy_lt_fern', item: 'fern', surface: 'floor', position: [1.9, 0.142, 0.5], rotation: 0, scale: 0.8 },
        { id: 'p_cozy_lt_duck', item: 'duck', surface: 'floor', position: [3.45, 0.142, 0.6], rotation: 0, scale: 0.8 },
        { id: 'p_cozy_lt_duckling', item: 'duckling', surface: 'floor', position: [3.85, 0.142, 0.4], rotation: 0, scale: 0.7 }
      ]
    },
    {
      id: 'vintage',
      name: 'Kỷ Vật Thời Gian',
      icon: '📷',
      description: 'Kệ sách hoài niệm, máy đĩa than, lọ sao ước nguyện và máy ảnh phim',
      decorations: [
        { id: 'p_vnt_lt_cubby', item: 'cubby', surface: 'floor', position: [2.8, 0.142, -0.55], rotation: 0, scale: 1.2 },
        { id: 'p_vnt_lt_turntable', item: 'turntable', surface: 'table', position: [2.4, 1.083, -0.55], rotation: 0, scale: 0.8, parent_id: 'p_vnt_lt_cubby' },
        { id: 'p_vnt_lt_camera', item: 'camera', surface: 'table', position: [3.0, 1.083, -0.5], rotation: -15, scale: 0.8, parent_id: 'p_vnt_lt_cubby' },
        { id: 'p_vnt_lt_fern', item: 'fern', surface: 'floor', position: [2.0, 0.142, 0.45], rotation: 0, scale: 0.8 },
        { id: 'p_vnt_lt_starjar', item: 'star-jar', surface: 'table', position: [3.1, 0.668, -0.52], rotation: 0, scale: 0.7, parent_id: 'p_vnt_lt_cubby' }
      ]
    },
    {
      id: 'minimalist',
      name: 'Gọn Gàng Khoáng Đạt',
      icon: '🪴',
      description: 'Tủ tối giản, cây cảnh thanh lọc, máy đĩa than gọn gàng',
      decorations: [
        { id: 'p_min_lt_cubby', item: 'cubby', surface: 'floor', position: [2.9, 0.142, -0.55], rotation: 0, scale: 1.1 },
        { id: 'p_min_lt_turn', item: 'turntable', surface: 'table', position: [2.9, 1.083, -0.55], rotation: 0, scale: 0.8, parent_id: 'p_min_lt_cubby' },
        { id: 'p_min_lt_fern', item: 'fern', surface: 'floor', position: [2.0, 0.142, 0.4], rotation: 0, scale: 0.8 }
      ]
    },
    {
      id: 'memoir',
      name: 'Góc Lưu Bút & Điều Ước',
      icon: '⭐',
      description: 'Lọ sao điều ước, lịch để bàn, máy ảnh retro và đàn vịt con',
      decorations: [
        { id: 'p_mem_lt_cubby', item: 'cubby', surface: 'floor', position: [2.8, 0.142, -0.55], rotation: 0, scale: 1.2 },
        { id: 'p_mem_lt_cal', item: 'calendar', surface: 'table', position: [2.4, 1.083, -0.55], rotation: 0, scale: 0.8, parent_id: 'p_mem_lt_cubby', text: 'Khoảnh khắc' },
        { id: 'p_mem_lt_starjar', item: 'star-jar', surface: 'table', position: [3.0, 1.083, -0.5], rotation: 0, scale: 0.75, parent_id: 'p_mem_lt_cubby' },
        { id: 'p_mem_lt_camera', item: 'camera', surface: 'table', position: [3.1, 0.668, -0.52], rotation: -10, scale: 0.75, parent_id: 'p_mem_lt_cubby' },
        { id: 'p_mem_lt_fern', item: 'fern', surface: 'floor', position: [1.9, 0.142, 0.45], rotation: 0, scale: 0.8 },
        { id: 'p_mem_lt_duck', item: 'duck', surface: 'floor', position: [3.4, 0.142, 0.55], rotation: 0, scale: 0.8 }
      ]
    }
  ],
  memories: [
    {
      id: 'cozy',
      name: 'Phòng Khách Ấm Cúng',
      icon: '🛋️',
      description: 'Sofa mềm mại, gấu teddy khổng lồ, thảm cúc, bàn trà album ảnh và khung tranh',
      decorations: [
        { id: 'p_cozy_mem_sofa', item: 'sofa', surface: 'floor', position: [-2.05, 2.392, -0.58], rotation: 0, scale: 1 },
        { id: 'p_cozy_mem_teddy', item: 'teddy', surface: 'floor', position: [-0.8, 2.392, -0.38], rotation: 0, scale: 1.15 },
        { id: 'p_cozy_mem_rug', item: 'daisy-rug', surface: 'floor', position: [-0.857, 2.392, 0.547], rotation: 0, scale: 1 },
        { id: 'p_cozy_mem_table', item: 'coffee-table', surface: 'floor', position: [-0.857, 2.431, 0.547], rotation: 10, scale: 1, parent_id: 'p_cozy_mem_rug' },
        { id: 'p_cozy_mem_album', item: 'album', surface: 'table', position: [-0.957, 2.805, 0.547], rotation: -9, scale: 0.7, parent_id: 'p_cozy_mem_table' },
        { id: 'p_cozy_mem_shelf', item: 'shelf', surface: 'wall', position: [-3.108, 3.132, -1.022], rotation: 0, scale: 0.65 },
        { id: 'p_cozy_mem_lamp', item: 'lamp', surface: 'shelf', position: [-3.108, 3.279, -1.022], rotation: 0, scale: 0.4, parent_id: 'p_cozy_mem_shelf' },
        { id: 'p_cozy_mem_frame', item: 'frame', surface: 'wall', position: [-0.75, 3.528, -1.058], rotation: 0, scale: 0.65 }
      ]
    },
    {
      id: 'vintage',
      name: 'Salon Nâu Hoài Cổ',
      icon: '🎞️',
      description: 'Sofa retro, bàn trà gỗ mộc, album ảnh đôi, đèn sàn cổ điển và khung tranh',
      decorations: [
        { id: 'p_vnt_mem_sofa', item: 'sofa', surface: 'floor', position: [-1.9, 2.392, -0.55], rotation: 0, scale: 1 },
        { id: 'p_vnt_mem_table', item: 'coffee-table', surface: 'floor', position: [-0.85, 2.392, 0.4], rotation: 0, scale: 1 },
        { id: 'p_vnt_mem_album', item: 'album', surface: 'table', position: [-0.85, 2.766, 0.4], rotation: -5, scale: 0.7, parent_id: 'p_vnt_mem_table' },
        { id: 'p_vnt_mem_frame', item: 'frame', surface: 'wall', position: [-0.9, 3.5, -1.05], rotation: 0, scale: 0.7 },
        { id: 'p_vnt_mem_lamp', item: 'lamp', surface: 'floor', position: [-3.2, 2.392, -0.6], rotation: 0, scale: 0.8 }
      ]
    },
    {
      id: 'minimalist',
      name: 'Gallery Tinh Giản',
      icon: '🖼️',
      description: 'Sofa tối giản, khung tranh tường lớn, bàn trà kính và album ảnh nghệ thuật',
      decorations: [
        { id: 'p_min_mem_sofa', item: 'sofa', surface: 'floor', position: [-1.8, 2.392, -0.5], rotation: 0, scale: 1 },
        { id: 'p_min_mem_frame', item: 'frame', surface: 'wall', position: [-0.8, 3.5, -1.05], rotation: 0, scale: 0.7 },
        { id: 'p_min_mem_table', item: 'coffee-table', surface: 'floor', position: [-0.8, 2.392, 0.35], rotation: 0, scale: 0.9 },
        { id: 'p_min_mem_album', item: 'album', surface: 'table', position: [-0.8, 2.766, 0.35], rotation: 0, scale: 0.7, parent_id: 'p_min_mem_table' }
      ]
    },
    {
      id: 'loveseat',
      name: 'Tổ Ấm Yêu Thương',
      icon: '🧸',
      description: 'Sofa êm ái, gấu teddy, khung tranh đôi trên tường và khung ảnh sao lung linh',
      decorations: [
        { id: 'p_lov_mem_sofa', item: 'sofa', surface: 'floor', position: [-2.0, 2.392, -0.55], rotation: 0, scale: 1 },
        { id: 'p_lov_mem_teddy', item: 'teddy', surface: 'floor', position: [-0.85, 2.392, -0.35], rotation: 0, scale: 1.1 },
        { id: 'p_lov_mem_table', item: 'coffee-table', surface: 'floor', position: [-0.85, 2.392, 0.45], rotation: 0, scale: 0.95 },
        { id: 'p_lov_mem_album', item: 'album', surface: 'table', position: [-0.85, 2.766, 0.45], rotation: -8, scale: 0.7, parent_id: 'p_lov_mem_table' },
        { id: 'p_lov_mem_frame', item: 'frame', surface: 'wall', position: [-1.4, 3.5, -1.05], rotation: 0, scale: 0.75 },
        { id: 'p_lov_mem_star', item: 'star-frame', surface: 'wall', position: [-2.6, 3.4, -1.04], rotation: 0, scale: 0.65 }
      ]
    }
  ],
  'next-chapter': [
    {
      id: 'cozy',
      name: 'Tương Lai Ấm Áp',
      icon: '☁️',
      description: 'Bàn làm việc chung, thỏ bông, đèn đám mây, khung ảnh sao và nến thơm mật ong',
      decorations: [
        { id: 'p_cozy_nxt_desk', item: 'desk', surface: 'floor', position: [1.6, 2.392, -0.6], rotation: 0, scale: 1 },
        { id: 'p_cozy_nxt_rabbit', item: 'rabbit', surface: 'floor', position: [2.9, 2.392, 0.45], rotation: 0, scale: 1.2 },
        { id: 'p_cozy_nxt_chair', item: 'chair', surface: 'floor', position: [1.5, 2.392, 0.35], rotation: 14, scale: 1 },
        { id: 'p_cozy_nxt_cloud', item: 'cloud-lamp', surface: 'table', position: [1.318, 3.025, -0.724], rotation: 0, scale: 0.85, parent_id: 'p_cozy_nxt_desk' },
        { id: 'p_cozy_nxt_star', item: 'star-frame', surface: 'table', position: [2.1, 3.025, -0.65], rotation: 0, scale: 0.75, parent_id: 'p_cozy_nxt_desk' },
        { id: 'p_cozy_nxt_candle', item: 'honey-candle', surface: 'table', position: [1.75, 3.025, -0.6], rotation: 0, scale: 0.6, parent_id: 'p_cozy_nxt_desk' }
      ]
    },
    {
      id: 'vintage',
      name: 'Ngày Chung Đôi Cổ Điển',
      icon: '📅',
      description: 'Bàn viết mộc, ghế tựa, lịch để bàn "Ngày chung đôi", nến thơm và kệ sách',
      decorations: [
        { id: 'p_vnt_nxt_desk', item: 'desk', surface: 'floor', position: [1.7, 2.392, -0.58], rotation: 0, scale: 1 },
        { id: 'p_vnt_nxt_chair', item: 'chair', surface: 'floor', position: [1.7, 2.392, 0.35], rotation: 0, scale: 1 },
        { id: 'p_vnt_nxt_cal', item: 'calendar', surface: 'table', position: [1.3, 3.025, -0.65], rotation: 0, scale: 0.8, parent_id: 'p_vnt_nxt_desk', text: 'Ngày chung đôi' },
        { id: 'p_vnt_nxt_candle', item: 'candles', surface: 'table', position: [2.1, 3.025, -0.6], rotation: 0, scale: 0.65, parent_id: 'p_vnt_nxt_desk' },
        { id: 'p_vnt_nxt_shelf', item: 'shelf', surface: 'wall', position: [2.9, 3.3, -1.04], rotation: 0, scale: 0.65 }
      ]
    },
    {
      id: 'minimalist',
      name: 'Khoáng Đạt Tinh Tế',
      icon: '🌅',
      description: 'Bàn làm việc thanh thoát, ghế tựa, đèn mây tinh khôi và khung sao hy vọng',
      decorations: [
        { id: 'p_min_nxt_desk', item: 'desk', surface: 'floor', position: [1.8, 2.392, -0.55], rotation: 0, scale: 1 },
        { id: 'p_min_nxt_chair', item: 'chair', surface: 'floor', position: [1.8, 2.392, 0.35], rotation: 0, scale: 1 },
        { id: 'p_min_nxt_lamp', item: 'cloud-lamp', surface: 'table', position: [1.4, 3.025, -0.65], rotation: 0, scale: 0.85, parent_id: 'p_min_nxt_desk' },
        { id: 'p_min_nxt_star', item: 'star-frame', surface: 'table', position: [2.2, 3.025, -0.6], rotation: 0, scale: 0.75, parent_id: 'p_min_nxt_desk' }
      ]
    },
    {
      id: 'dreamer',
      name: 'Vườn Ước Mơ',
      icon: '🌟',
      description: 'Bàn làm việc, đèn đám mây, khung ảnh sao ước nguyện, lịch để bàn và nến thơm',
      decorations: [
        { id: 'p_drm_nxt_desk', item: 'desk', surface: 'floor', position: [1.65, 2.392, -0.58], rotation: 0, scale: 1 },
        { id: 'p_drm_nxt_chair', item: 'chair', surface: 'floor', position: [1.65, 2.392, 0.35], rotation: 0, scale: 1 },
        { id: 'p_drm_nxt_cal', item: 'calendar', surface: 'table', position: [1.25, 3.025, -0.65], rotation: 0, scale: 0.8, parent_id: 'p_drm_nxt_desk', text: 'Tương lai' },
        { id: 'p_drm_nxt_cloud', item: 'cloud-lamp', surface: 'table', position: [1.65, 3.025, -0.72], rotation: 0, scale: 0.8, parent_id: 'p_drm_nxt_desk' },
        { id: 'p_drm_nxt_star', item: 'star-frame', surface: 'table', position: [2.15, 3.025, -0.62], rotation: 0, scale: 0.75, parent_id: 'p_drm_nxt_desk' },
        { id: 'p_drm_nxt_candle', item: 'honey-candle', surface: 'table', position: [2.5, 3.025, -0.6], rotation: 0, scale: 0.6, parent_id: 'p_drm_nxt_desk' }
      ]
    }
  ]
};

// Preset toàn ngôi nhà (Whole-House Presets)
export const HOUSE_PRESETS = [
  {
    id: 'cozy',
    name: 'Cozy Ấm Áp',
    tagline: 'Gỗ sáng, sofa hồng, thỏ bông, đèn đám mây, máy đĩa than và thảm cúc dịu êm',
    theme: 'warm_gold',
    icon: '✨'
  },
  {
    id: 'vintage',
    name: 'Vintage Hoài Niệm',
    tagline: 'Tông nâu hoài cổ, bàn viết gỗ mộc, máy ảnh retro, kệ sách và kỷ vật thời gian',
    theme: 'classic',
    icon: '🎞️'
  },
  {
    id: 'minimalist',
    name: 'Minimalist Tinh Tế',
    tagline: 'Không gian thoáng đãng, tranh tường nghệ thuật, ánh sáng dịu và chậu cây xanh',
    theme: 'minimal_dark',
    icon: '🌿'
  }
];

/**
 * Áp dụng một preset mẫu cho ĐÚNG MỘT PHÒNG riêng biệt:
 * - Thay thế đồ đạc của phòng đó bằng preset được chọn
 * - Giữ nguyên ảnh kỷ niệm của phòng đó và phân bổ vào các vị trí đồ vật mới
 * - Giữ các phòng khác hoàn toàn không bị ảnh hưởng
 * - Đồng bộ 100% furnishingBaseline cho database trigger
 */
export function applyPresetToSingleRoom(currentRoom, presetId = 'cozy') {
  if (!currentRoom || !currentRoom.id) return currentRoom;
  const presetsForRoom = ROOM_PRESETS[currentRoom.id] || [];
  const targetPreset = presetsForRoom.find(p => p.id === presetId) || presetsForRoom[0];
  if (!targetPreset) return currentRoom;

  const newDecorations = (targetPreset.decorations || []).map(item => ({ ...item }));

  // Phân bổ lại ảnh kỷ niệm đang có vào đồ vật hỗ trợ ảnh
  const memories = Array.isArray(currentRoom.memories) ? currentRoom.memories : [];
  let photoIndex = 0;

  for (const d of newDecorations) {
    if (['frame', 'star-frame', 'calendar', 'nameplate'].includes(d.item) && memories[photoIndex]) {
      d.photos = [memories[photoIndex].id];
      photoIndex++;
    } else if (d.item === 'album' && memories[photoIndex]) {
      d.photos = [memories[photoIndex].id, memories[photoIndex + 1]?.id].filter(Boolean);
      photoIndex += 2;
    } else if (d.item === 'bunting' && memories[photoIndex]) {
      d.photos = [memories[photoIndex].id, memories[photoIndex + 1]?.id, memories[photoIndex + 2]?.id].filter(Boolean);
      photoIndex += 3;
    }
  }

  // Baseline chuẩn hóa = chính xác các món đồ hiện có sau khi bỏ text và photos
  const baseline = newDecorations.map(({ text, photos, ...base }) => ({ ...base }));

  return {
    ...currentRoom,
    furnishingVersion: 2,
    furnishingBaseline: baseline,
    decorations: newDecorations
  };
}

export const applyRoomPreset = applyPresetToSingleRoom;

/**
 * Áp dụng một bộ preset mẫu vào TOÀN BỘ danh sách 5 phòng:
 * - Thay thế toàn bộ đồ đạc bằng đồ bài trí mẫu của preset
 * - Tự động bảo toàn và gắn ảnh kỷ niệm của người dùng vào các khung ảnh/album/lịch của mẫu mới
 * - Giữ nguyên mốc furnishingBaseline đồng bộ 100% để database trigger không bao giờ bị lỗi
 */
export function applyPresetToRooms(currentRooms = [], presetId = 'cozy') {
  return currentRooms.map(room => applyPresetToSingleRoom(room, presetId));
}

export const applyPresetToHouse = applyPresetToRooms;

