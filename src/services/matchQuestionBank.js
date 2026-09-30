// Names refer to fixed participants, never to the reader's point of view.
export const MATCH_TOPICS = [
  ["romance","Cảm xúc & Kết nối","💛","Những chuyện nhỏ khiến mình quý nhau hơn"],
  ["lifestyle","Thói quen & Đời thường","☕","Ăn gì, ngủ sao, tiêu tiền kiểu nào"],
  ["future_home","Không gian sống & Tương lai","🏡","Góc riêng, điều muốn thử và kế hoạch sắp tới"],
  ["funny","Tình huống hóc búa","🎭","Trễ hẹn, nhầm tin và những pha khó đỡ"],
  ["deep_soul","Thấu hiểu & Quan tâm","🌙","Hiểu cách nhau nghỉ ngơi, góp ý và cần giúp đỡ"],
].map(([id,title,emoji,tagline])=>({id,title,emoji,tagline,color:'from-rose-500/15 to-violet-500/10 border-white/15 text-rose-200'}));

const packs = {
  "romance": [
    [
      "Điều gì dễ khiến {owner} có thiện cảm khi mới trò chuyện?",
      [
        "Biết lắng nghe",
        "Nói chuyện có duyên",
        "Có chung sở thích",
        "Nhớ đúng tên, không gọi nhầm"
      ]
    ],
    [
      "{partner} thường bắt đầu cuộc trò chuyện bằng gì?",
      [
        "Hỏi hôm nay thế nào",
        "Gửi một chuyện vừa gặp",
        "Gửi ảnh hoặc video vui",
        "Đợi có chuyện cụ thể mới nhắn"
      ]
    ],
    [
      "{owner} thích được rủ gặp theo kiểu nào?",
      [
        "Chốt rõ giờ và địa điểm",
        "Cho vài lựa chọn rồi cùng chọn",
        "Hỏi lúc nào rảnh trước",
        "Rủ bất chợt nếu đang tiện"
      ]
    ],
    [
      "{partner} dễ nhớ điều gì sau một lần gặp?",
      [
        "Câu chuyện đã nghe",
        "Món ăn hoặc đồ uống",
        "Một hành động chu đáo",
        "Pha ngớ ngẩn cả hai cùng cười"
      ]
    ],
    [
      "Khi có tin vui, {owner} thường chia sẻ bằng cách nào?",
      [
        "Nhắn ngay vài dòng",
        "Gọi kể cho đã",
        "Đợi gặp rồi kể",
        "Gửi ảnh thay lời muốn nói"
      ]
    ],
    [
      "Kiểu lời khen nào khiến {partner} vui nhất?",
      [
        "Khen việc vừa làm tốt",
        "Khen sự cố gắng",
        "Khen gu chọn đồ",
        "Khen nói chuyện vui"
      ]
    ],
    [
      "{owner} hay thể hiện sự quý mến qua việc gì?",
      [
        "Chủ động hỏi han",
        "Nhớ sở thích của người kia",
        "Dành thời gian gặp gỡ",
        "Giúp một việc đang cần"
      ]
    ],
    [
      "{partner} thích kiểu quà nhỏ nào nhất?",
      [
        "Món ăn thích",
        "Đồ dùng đúng lúc đang thiếu",
        "Món liên quan đến sở thích",
        "Một tấm ảnh kèm lời nhắn"
      ]
    ],
    [
      "Khi lâu rồi chưa nói chuyện, {owner} dễ mở lời thế nào?",
      [
        "Dạo này sao rồi?",
        "Thấy cái này nhớ tới nhau",
        "Cuối tuần rảnh không?",
        "Gửi meme để kiểm tra sóng"
      ]
    ],
    [
      "{partner} thích cuộc gặp đông người hay ít người hơn?",
      [
        "Chỉ hai người cho dễ nói",
        "Nhóm nhỏ ba bốn người",
        "Đông vui càng tốt",
        "Tùy hoạt động hôm đó"
      ]
    ],
    [
      "Điều gì dễ làm {owner} thấy một cuộc trò chuyện hợp ý?",
      [
        "Được nói hết câu",
        "Cùng cười vì chuyện nhỏ",
        "Trao đổi được điều mới",
        "Im một lúc vẫn thoải mái"
      ]
    ],
    [
      "{partner} thường giữ kỷ niệm bằng cách nào?",
      [
        "Chụp nhiều ảnh",
        "Giữ món đồ nhỏ",
        "Lưu tin nhắn đáng nhớ",
        "Nhớ trong đầu rồi kể lại"
      ]
    ],
    [
      "{owner} thích nghe kể chuyện theo kiểu nào?",
      [
        "Nói kết quả trước",
        "Kể từ đầu đến cuối",
        "Cho xem ảnh rồi kể",
        "Kể ngắn, chỗ hay thì hỏi thêm"
      ]
    ],
    [
      "Nếu muốn cảm ơn {partner}, cách nào hợp nhất?",
      [
        "Nói thẳng lời cảm ơn",
        "Mời một món ăn hoặc đồ uống",
        "Giúp lại khi có dịp",
        "Viết một lời nhắn riêng"
      ]
    ],
    [
      "{owner} thích được chúc mừng ngày đặc biệt thế nào?",
      [
        "Một tin nhắn riêng",
        "Một cuộc gọi ngắn",
        "Gặp nhau ăn uống",
        "Nhẹ nhàng thôi, đừng làm bất ngờ"
      ]
    ],
    [
      "Một buổi gặp lý tưởng của {partner} nên kết thúc lúc nào?",
      [
        "Đúng giờ đã tính",
        "Khi hết chuyện để nói",
        "Khi bắt đầu thấy mệt",
        "Sau câu thêm năm phút lần thứ ba"
      ]
    ],
    [
      "{owner} thường gửi loại nội dung nào để bắt chuyện?",
      [
        "Đồ ăn và chỗ đi chơi",
        "Nhạc hoặc phim hay",
        "Chuyện thường ngày",
        "Ảnh hài hợp tâm trạng"
      ]
    ],
    [
      "{partner} dễ nhận lời hoạt động nào nhất?",
      [
        "Ăn một món cụ thể",
        "Đi dạo một vòng",
        "Ngồi uống nước trò chuyện",
        "Chơi một trò đơn giản"
      ]
    ],
    [
      "Sau buổi gặp vui, {owner} thường làm gì?",
      [
        "Nhắn đã về tới nơi",
        "Gửi ảnh vừa chụp",
        "Rủ luôn dịp tiếp theo",
        "Nghỉ ngơi, hôm sau mới nhắn"
      ]
    ],
    [
      "Trong một cuộc hẹn, điều gì quan trọng nhất với {partner}?",
      [
        "Giữ đúng lời đã hẹn",
        "Có thời gian nói chuyện",
        "Không bị giục vội",
        "Được cùng chọn hoạt động"
      ]
    ],
    [
      "{owner} thích được rủ đi dạo vào khung giờ nào nhất?",
      [
        "Chiều mát vừa tan làm",
        "Tối muộn phố xá vắng dần",
        "Cuối tuần sáng sớm thong thả",
        "Bất cứ khi nào cần hóng gió xả stress"
      ]
    ],
    [
      "{partner} thường phản ứng thế nào khi bất ngờ được tặng một món quà không nhân dịp gì?",
      [
        "Mắt sáng rỡ rồi mở xem ngay",
        "Nghi ngờ hỏi ngay \"Hôm nay có vụ gì à?\"",
        "Cảm động nhưng dặn lần sau đừng tốn kém",
        "Chụp ảnh khoe ngay lập tức"
      ]
    ],
    [
      "{owner} cảm thấy được thấu hiểu nhất khi người kia làm gì?",
      [
        "Nhớ một thói quen nhỏ của mình",
        "Không hỏi dồn khi thấy mình im lặng",
        "Tiếp lời đúng ý mình đang định nói",
        "Tự động mua đúng món mình đang thèm"
      ]
    ],
    [
      "Khi ngồi chung xe đi xa, {partner} thường đóng vai trò gì?",
      [
        "DJ chuyên nghiệp chọn playlist",
        "Hoa tiêu xem bản đồ chỉ đường",
        "Bếp trưởng bóc đồ ăn vặt tiếp tế",
        "Hành khách ngủ gật sau 15 phút"
      ]
    ],
    [
      "Nếu phải chọn một kiểu hẹn hò không tốn kém, {owner} sẽ chọn gì?",
      [
        "Đi dạo công viên ngắm cảnh",
        "Ra bờ sông ngồi uống trà đá cắn hướng dương",
        "Cùng nhau ghé nhà sách đọc truyện",
        "Ở nhà cùng nấu mì gói xem phim"
      ]
    ],
    [
      "{partner} thường làm gì khi đối phương vô tình kể chuyện hơi nhạt?",
      [
        "Cười trừ cho đỡ ngượng",
        "Trêu thẳng \"Chuyện nhạt quá đổi chuyện khác đi\"",
        "Ráng hỏi thêm để cứu câu chuyện",
        "Đứng hình 3 giây rồi mới phản ứng"
      ]
    ],
    [
      "Khi muốn xin lỗi một cách tinh tế, {owner} thường làm gì?",
      [
        "Mua một món ăn người kia thích",
        "Nhắn một tin dài chân thành",
        "Tự giác nhận lỗi và không thanh minh",
        "Làm mặt đáng yêu để xin tha"
      ]
    ],
    [
      "{partner} thích một buổi hẹn hò bất ngờ hay được lên lịch trước?",
      [
        "Bất ngờ hoàn toàn cho thú vị",
        "Lên lịch trước để kịp chuẩn bị đồ đẹp",
        "Báo trước 1 tiếng là đủ",
        "Tùy tâm trạng hôm đó"
      ]
    ],
    [
      "{owner} dễ bật cười nhất vì điều gì ở người kia?",
      [
        "Điệu cười đặc trưng không lẫn đi đâu",
        "Những pha vụng về rất đáng yêu",
        "Những phát ngôn ngây ngô bất ngờ",
        "Biểu cảm lúc đang cố cãi cùn"
      ]
    ],
    [
      "Khi đi ăn cùng nhau, {partner} thường nhường miếng ngon cuối cùng cho ai?",
      [
        "Nhường thẳng cho đối phương",
        "Chia đôi sòng phẳng mỗi người một nửa",
        "Hỏi lịch sự 1 câu rồi gắp ăn luôn",
        "Gắp cho người kia kèm câu \"Ăn đi cho béo\""
      ]
    ],
    [
      "{owner} thích lưu biệt danh của đối phương trong danh bạ theo kiểu nào?",
      [
        "Tên thật kèm một emoji nhẹ nhàng",
        "Biệt danh hài hước chỉ hai đứa hiểu",
        "Tên gọi ngọt ngào",
        "Để nguyên họ và tên đầy đủ cho nghiêm túc"
      ]
    ],
    [
      "{partner} thích được an ủi bằng hành động nào nhất khi gặp chuyện ấm ức?",
      [
        "Một cái ôm thật chặt không cần nói",
        "Cùng ngồi mắng đứa làm mình bực",
        "Dẫn đi ăn một bữa thật ngon",
        "Cho không gian yên tĩnh tự nguôi"
      ]
    ],
    [
      "{owner} thường làm gì khi đối phương gửi một bức ảnh \"dìm hàng\" của mình?",
      [
        "Thả tim rồi lưu về máy",
        "Lập tức tìm ảnh dìm của đối phương để đáp trả",
        "Yêu cầu xóa ngay trong 3 nốt nhạc",
        "Đem đi làm meme đại diện luôn"
      ]
    ],
    [
      "{partner} thích kiểu chụp ảnh nào nhất khi đi chơi cùng nhau?",
      [
        "Chụp bắt khoảnh khắc tự nhiên",
        "Tạo dáng chuẩn chỉnh nghiêm túc",
        "Chụp đồ ăn và phong cảnh là chính",
        "Tự sướng góc cận mặt hài hước"
      ]
    ],
    [
      "Khi có một bí mật vui, {owner} thường giữ được trong bao lâu trước khi kể cho đối phương?",
      [
        "Kể ngay lập tức không nén nổi",
        "Giữ được vài tiếng đợi lúc gặp mặt",
        "Nhá hàng trước rồi mới chịu kể",
        "Giữ được đến cuối ngày"
      ]
    ],
    [
      "{partner} thường có phản xạ gì khi đối phương nhìn chằm chằm vào mình?",
      [
        "Cười ngượng rồi nhìn đi chỗ khác",
        "Hỏi ngay \"Mặt dính gì à?\"",
        "Nhìn lại thi xem ai chớp mắt trước",
        "Vuốt tóc làm dáng tự tin"
      ]
    ],
    [
      "{owner} thích nhận được tin nhắn chúc ngủ ngon vào lúc nào?",
      [
        "Trước khi chuẩn bị đi ngủ",
        "Lúc nào cũng được, miễn là có nhắn",
        "Kèm một câu dặn dò mai dậy sớm",
        "Gửi kèm một chiếc meme hài hước"
      ]
    ],
    [
      "Khi đối phương bị ốm nhẹ, {partner} sẽ làm gì đầu tiên?",
      [
        "Đặt cháo hoặc thuốc giao tận nơi",
        "Nhắn tin nhắc uống nước và nghỉ ngơi liên tục",
        "Chạy qua chăm sóc trực tiếp",
        "Mắng nhẹ một câu vì tội không giữ ấm"
      ]
    ],
    [
      "{owner} trân trọng khoảnh khắc nào nhất sau một chuyến đi chơi dài?",
      [
        "Lúc ngồi cạnh nhau cùng ngắm hoàng hôn",
        "Lúc cùng ngồi xem lại đống ảnh chụp",
        "Lúc về đến nơi nhắn tin \"Đã về an toàn\"",
        "Lúc cùng bàn xem lần tới sẽ đi đâu"
      ]
    ],
    [
      "Điều gì khiến {partner} cảm thấy cuộc trò chuyện giữa hai người không bao giờ nhàm chán?",
      [
        "Có thể nói từ chuyện vĩ mô đến chuyện nhảm nhí",
        "Cùng chung gu hài hước, cười cùng một điểm",
        "Cả hai đều thoải mái là chính mình",
        "Thậm chí ngồi im không nói vẫn thấy dễ chịu"
      ]
    ]
  ],
  "lifestyle": [
    [
      "Báo thức reo lần đầu, {owner} thường làm gì?",
      [
        "Dậy ngay",
        "Bấm ngủ thêm",
        "Xem điện thoại trước",
        "Thương lượng thêm năm phút với cái gối"
      ]
    ],
    [
      "Chưa biết ăn gì, {partner} thường chọn cách nào?",
      [
        "Ăn món quen",
        "Xem quán quanh mình",
        "Nhờ gợi ý vài món",
        "Mở tủ lạnh xem còn gì"
      ]
    ],
    [
      "Khi gọi nước, {owner} thường ưu tiên gì?",
      [
        "Món quen cho chắc",
        "Món mới để thử",
        "Món ít ngọt",
        "Món đang được giảm giá"
      ]
    ],
    [
      "{partner} hay để chìa khóa ở đâu?",
      [
        "Một chỗ cố định",
        "Trong túi mang hằng ngày",
        "Gần cửa ra vào",
        "Chỗ nào tiện tay lúc về"
      ]
    ],
    [
      "Được rảnh nửa ngày, {owner} thích làm gì nhất?",
      [
        "Ngủ bù",
        "Ra ngoài đổi không khí",
        "Làm sở thích riêng",
        "Dọn vài việc còn dang dở"
      ]
    ],
    [
      "{partner} mua đồ theo kiểu nào nhiều hơn?",
      [
        "Lên danh sách trước",
        "Thiếu gì mua nấy",
        "Chờ dịp giảm giá",
        "Thấy hợp mắt mới cân nhắc"
      ]
    ],
    [
      "Khi ăn món ngon, {owner} thường làm gì đầu tiên?",
      [
        "Ăn ngay cho nóng",
        "Chụp ảnh trước",
        "Mời người đi cùng thử",
        "Hỏi món này làm thế nào"
      ]
    ],
    [
      "{partner} thích chỗ ngồi nào khi vào quán?",
      [
        "Gần cửa sổ",
        "Góc yên tĩnh",
        "Gần quầy cho tiện gọi",
        "Chỗ nào mát nhất"
      ]
    ],
    [
      "Điện thoại còn 10% pin, {owner} thường làm gì?",
      [
        "Tìm chỗ sạc",
        "Bật tiết kiệm pin",
        "Cất máy để dành lúc cần",
        "Vẫn dùng, tin vào phép màu"
      ]
    ],
    [
      "{partner} thường chọn quần áo đi ra ngoài theo gì?",
      [
        "Thoải mái là chính",
        "Hợp nơi sắp đến",
        "Hợp tâm trạng",
        "Bộ dễ lấy nhất"
      ]
    ],
    [
      "Trước khi ngủ, {owner} hay làm gì nhất?",
      [
        "Xem điện thoại một lúc",
        "Đọc hoặc nghe gì đó",
        "Chuẩn bị đồ cho ngày mai",
        "Nằm xuống là muốn ngủ"
      ]
    ],
    [
      "Trong siêu thị, {partner} dễ mua thêm gì nhất?",
      [
        "Đồ ăn vặt",
        "Trái cây",
        "Đồ dùng nhỏ",
        "Chỉ mua đúng thứ cần"
      ]
    ],
    [
      "{owner} thích ăn sáng theo kiểu nào?",
      [
        "Ăn ở nhà",
        "Mua mang đi",
        "Ngồi quán ăn thong thả",
        "Khi nào đói mới ăn"
      ]
    ],
    [
      "Nhận một tin nhắn không gấp, {partner} thường trả lời khi nào?",
      [
        "Đọc là trả lời luôn",
        "Xong việc đang làm",
        "Gom lại trả lời lúc rảnh",
        "Nghĩ đã trả lời nhưng mới nghĩ thôi"
      ]
    ],
    [
      "Lúc cần tập trung, {owner} thích không gian nào?",
      [
        "Yên lặng",
        "Có nhạc không lời",
        "Có tiếng người vừa phải",
        "Đeo tai nghe ở đâu cũng được"
      ]
    ],
    [
      "{partner} hay lưu điều cần nhớ bằng cách nào?",
      [
        "Ghi chú điện thoại",
        "Đặt nhắc lịch",
        "Viết ra giấy",
        "Tự nhẩm để nhớ"
      ]
    ],
    [
      "Đi ăn món lạ, {owner} thường chọn mức thử nghiệm nào?",
      [
        "Gọi đúng món nổi tiếng nhất",
        "Chọn món gần giống món quen",
        "Chia phần nhỏ để thử",
        "Để người khác chọn giúp"
      ]
    ],
    [
      "{partner} thích lúc nào trong ngày nhất?",
      [
        "Sáng sớm yên tĩnh",
        "Giữa ngày nhiều năng lượng",
        "Chiều khi xong việc",
        "Tối được làm điều mình thích"
      ]
    ],
    [
      "Khi gặp món muốn mua hơi quá ngân sách, {owner} sẽ làm gì?",
      [
        "Đợi tích đủ tiền",
        "Tìm món tương tự rẻ hơn",
        "Để vài ngày xem còn thích không",
        "Bỏ qua vì chưa thật sự cần"
      ]
    ],
    [
      "Đồ ăn mang về còn dư, {partner} thường xử lý thế nào?",
      [
        "Cất hộp cho bữa sau",
        "Chia cho người muốn ăn",
        "Biến thành món khác",
        "Lần sau gọi ít hơn"
      ]
    ],
    [
      "Khi gọi trà sữa hoặc cà phê, {owner} thường chọn mức đường đá thế nào?",
      [
        "100% đường đá đầy đủ cho đã",
        "Giảm ngọt 50% hoặc 30% cho heathy",
        "Không đường, chỉ uống nguyên bản",
        "Tùy hứng, quán gợi ý sao uống vậy"
      ]
    ],
    [
      "{partner} thường để bao nhiêu tab trình duyệt mở cùng một lúc trên máy tính/điện thoại?",
      [
        "Dưới 5 tab, dùng xong tắt ngay",
        "Khoảng 10-20 tab để tra cứu",
        "Vài chục tab đến mức hiện icon nhỏ xíu",
        "Không đếm nổi, máy đơ mới chịu tắt bớt"
      ]
    ],
    [
      "{owner} thường làm gì khi đang đi tắm mà chợt nảy ra một ý tưởng hay ho?",
      [
        "Tắm vội ra ghi chú ngay kẻo quên",
        "Cố lẩm nhẩm trong đầu suốt lúc tắm",
        "Tự nhủ lát ra ghi nhưng ra tới cửa là quên sạch",
        "Hát vang một bài ăn mừng ý tưởng"
      ]
    ],
    [
      "Khi đi chợ hoặc siêu thị mà quên mang túi đựng, {partner} sẽ làm gì?",
      [
        "Mua thêm túi ni lông hoặc túi vải",
        "Ôm hết đống đồ trong tay đi ra xe",
        "Xin một thùng carton cũ để đựng",
        "Nhét bớt vào balo hoặc túi áo khoác"
      ]
    ],
    [
      "{owner} thường sắp xếp tủ quần áo theo phong cách nào?",
      [
        "Phân loại ngăn nắp theo màu hoặc loại áo quần",
        "Treo móc những bộ hay mặc, còn lại gấp gọn",
        "Chỗ nào trống thì nhét vào",
        "Ghế ngồi trong phòng là chiếc tủ quần áo thứ hai"
      ]
    ],
    [
      "{partner} thường chọn vị trí ngồi nào khi đi xe buýt hoặc máy bay?",
      [
        "Cạnh cửa sổ để ngắm cảnh và ngủ",
        "Cạnh lối đi cho dễ đứng lên di chuyển",
        "Ngồi hàng đầu cho thoáng",
        "Chỗ nào còn trống là ngồi"
      ]
    ],
    [
      "Khi lướt mạng xã hội vào ban đêm, {owner} thường dừng lại ở nội dung gì lâu nhất?",
      [
        "Video dạy nấu ăn hoặc review ẩm thực",
        "Video động vật hài hước dễ thương",
        "Tin tức hoặc chuyện giật gân trong ngày",
        "Video unboxing hoặc đồ công nghệ"
      ]
    ],
    [
      "{partner} xử lý thế nào khi quần áo phơi khô nhưng chưa muốn gấp?",
      [
        "Gom lại để trên giường hoặc ghế đợi rảnh",
        "Gấp ngay lập tức cho phẳng phiu",
        "Treo nguyên trên móc, khi nào mặc thì lấy",
        "Nhờ người khác gấp hộ"
      ]
    ],
    [
      "{owner} thường uống bao nhiêu nước mỗi ngày?",
      [
        "Uống đều đặn trên 2 lít",
        "Đặt bình to trước mặt nhưng chỉ nhớ uống khi khát khô cổ",
        "Uống trà, cà phê thay nước lọc",
        "Phải cài app nhắc uống nước mới nhớ"
      ]
    ],
    [
      "Khi đi ăn buffet, chiến thuật quen thuộc của {partner} là gì?",
      [
        "Ăn hải sản và thịt bò trước cho gỡ vốn",
        "Ăn mỗi món một ít để nếm thử",
        "Thích gì ăn nấy không tính toán",
        "Lỡ ăn no từ mấy món khai vị và bánh ngọt"
      ]
    ],
    [
      "{owner} thường mang theo những gì khi ra ngoài chỉ để mua đồ gần nhà?",
      [
        "Chỉ cầm duy nhất chiếc điện thoại",
        "Điện thoại kèm chìa khóa xe",
        "Đầy đủ ví tiền, điện thoại, chìa khóa",
        "Bê nguyên cả túi xách như đi chơi xa"
      ]
    ],
    [
      "{partner} phản ứng thế nào khi phát hiện một gói đồ ship tới nơi?",
      [
        "Rạch hộp khui hàng ngay lập tức",
        "Để trên bàn ngắm một lúc rồi mới bóc",
        "Quên mất mình từng đặt món này",
        "Nhờ người khác khui hộp giúp"
      ]
    ],
    [
      "{owner} thường mất bao lâu để chuẩn bị trước khi bước ra khỏi nhà?",
      [
        "Dưới 10 phút, cực kỳ nhanh gọn",
        "Khoảng 20 đến 30 phút",
        "Gần 1 tiếng để chọn đồ và chỉnh trang",
        "Tuyên bố \"5 phút nữa xong\" nhưng nửa tiếng sau vẫn chưa thấy đâu"
      ]
    ],
    [
      "{partner} giải quyết thế nào với chiếc bát đĩa cuối cùng trong bồn rửa?",
      [
        "Rửa ngay lập tức cho sạch bồn",
        "Ngâm nước để đó lát rửa sau",
        "Chờ tích đủ nhiều bát rồi rửa một thể",
        "Nhìn đắm đuối hy vọng có ai rửa giùm"
      ]
    ],
    [
      "Khi đi mua sắm quần áo, {owner} thường quyết định thế nào?",
      [
        "Thử đồ kỹ càng rồi mới mua",
        "Nhìn ưng mắt là mua luôn khỏi thử",
        "Chụp ảnh gửi xin ý kiến người khác",
        "Đi ngắm cho đã rồi về đặt online cho rẻ"
      ]
    ],
    [
      "{partner} thích không gian làm việc hoặc học tập thế nào?",
      [
        "Mặt bàn trống trơn ngăn nắp",
        "Đầy đủ sổ sách, bút viết, ly nước xung quanh",
        "Vừa làm vừa mở nhạc nền hoặc podcast",
        "Nằm trên giường làm việc cho thoải mái"
      ]
    ],
    [
      "{owner} thường chọn thức ăn theo tiêu chí nào khi đặt đồ ăn giao tận nơi?",
      [
        "Quán có mã giảm giá hoặc freeship",
        "Quán quen vị ngon ăn mãi không chán",
        "Tìm quán mới có nhiều đánh giá 5 sao",
        "Món nào giao nhanh nhất dưới 20 phút"
      ]
    ],
    [
      "Khi chiếc vớ (tất) bị lủng một lỗ nhỏ xíu ở ngón chân, {partner} sẽ làm gì?",
      [
        "Vứt ngay đi mua đôi mới",
        "Vẫn đi tiếp, khéo giấu vào trong giày không ai thấy",
        "Cất vào góc tính đem khâu lại",
        "Chuyển thành vớ đi trong nhà"
      ]
    ],
    [
      "{owner} có thói quen dọn dẹp phòng vào lúc nào?",
      [
        "Dọn định kỳ vào cuối tuần",
        "Mỗi ngày dọn một chút",
        "Khi nào bừa bộn không chịu nổi mới dọn",
        "Khi có hứng đột xuất vào lúc nửa đêm"
      ]
    ],
    [
      "{partner} thường để âm lượng chuông điện thoại ở chế độ nào?",
      [
        "Rung hoàn toàn, ghét tiếng chuông ồn ào",
        "Bật chuông to rõ ràng để không lỡ cuộc gọi",
        "Bật chế độ không làm phiền quanh năm",
        "Im lặng tuyệt đối, gọi nhỡ cả chục cuộc mới biết"
      ]
    ]
  ],
  "future_home": [
    [
      "Góc nghỉ ngơi lý tưởng của {owner} cần gì nhất?",
      [
        "Một chỗ nằm êm",
        "Ánh sáng dễ chịu",
        "Không gian yên tĩnh",
        "Chỗ để đồ ăn trong tầm với"
      ]
    ],
    [
      "Nếu đổi một thứ trong phòng, {partner} sẽ đổi gì trước?",
      [
        "Đèn",
        "Bàn ghế",
        "Chỗ cất đồ",
        "Màu sắc hoặc đồ trang trí"
      ]
    ],
    [
      "Có một khoản tiền rảnh nhỏ, {owner} muốn dùng vào đâu?",
      [
        "Để dành",
        "Học một thứ mới",
        "Đi chơi một buổi",
        "Mua món dùng hằng ngày"
      ]
    ],
    [
      "Trong thời gian tới, {partner} muốn thử hoạt động nào?",
      [
        "Nấu một món mới",
        "Tập một môn vận động",
        "Học kỹ năng sáng tạo",
        "Khám phá một chỗ chưa tới"
      ]
    ],
    [
      "Nếu được nghỉ ba ngày, {owner} thích kế hoạch nào?",
      [
        "Đi một nơi gần",
        "Ở nhà nghỉ thật kỹ",
        "Gặp những người lâu chưa gặp",
        "Mỗi ngày làm một việc mình thích"
      ]
    ],
    [
      "{partner} thích lên kế hoạch trước bao lâu cho chuyến đi ngắn?",
      [
        "Vài tuần",
        "Vài ngày",
        "Tối hôm trước",
        "Rảnh là đi nếu thuận tiện"
      ]
    ],
    [
      "Nếu chọn một món đồ dùng lâu dài, {owner} ưu tiên gì?",
      [
        "Bền",
        "Dễ dùng",
        "Gọn và tiện cất",
        "Giá phù hợp"
      ]
    ],
    [
      "{partner} muốn duy trì thói quen nào nhất?",
      [
        "Ngủ đúng giờ hơn",
        "Vận động đều hơn",
        "Dành thời gian cho sở thích",
        "Bớt nhìn màn hình"
      ]
    ],
    [
      "Nhà hoặc phòng của {owner} có chỗ trống, khả năng cao sẽ thêm gì?",
      [
        "Một chậu cây",
        "Kệ để đồ",
        "Góc ngồi thư giãn",
        "Để trống cho thoáng"
      ]
    ],
    [
      "{partner} thích một ngày nghỉ có lịch trình thế nào?",
      [
        "Chốt các việc chính",
        "Chỉ chốt một hoạt động",
        "Tùy hứng trong ngày",
        "Không lịch, xin phép được lười"
      ]
    ],
    [
      "Nếu học nấu ăn, {owner} muốn biết làm gì trước?",
      [
        "Món ăn hằng ngày",
        "Món thích nhưng hay phải mua",
        "Món nhanh dưới hai mươi phút",
        "Món đem mời mọi người"
      ]
    ],
    [
      "Điều gì khiến {partner} muốn quay lại một nơi từng đến?",
      [
        "Đồ ăn ngon",
        "Không khí dễ chịu",
        "Có kỷ niệm vui",
        "Đi lại thuận tiện"
      ]
    ],
    [
      "Khi đặt một mục tiêu mới, {owner} thường bắt đầu ra sao?",
      [
        "Chia thành bước nhỏ",
        "Tìm người làm cùng",
        "Tìm hiểu kỹ trước",
        "Thử luôn một buổi"
      ]
    ],
    [
      "{partner} muốn dành thêm thời gian cho điều gì?",
      [
        "Nghỉ ngơi",
        "Người thân quen",
        "Một sở thích đang bỏ dở",
        "Học điều có ích"
      ]
    ],
    [
      "Nếu có thêm một giờ rảnh mỗi ngày, {owner} sẽ dùng làm gì?",
      [
        "Ngủ thêm",
        "Đi bộ hoặc tập nhẹ",
        "Xem hoặc đọc thứ thích",
        "Làm việc đang trì hoãn"
      ]
    ],
    [
      "{partner} thích chỗ ở có ưu điểm nào nhất?",
      [
        "Gần nơi cần đi",
        "Yên tĩnh",
        "Có nhiều ánh sáng",
        "Gần hàng quán và tiện ích"
      ]
    ],
    [
      "Món nào {owner} dễ muốn nâng cấp khi có điều kiện?",
      [
        "Điện thoại hoặc máy tính",
        "Giường và gối",
        "Dụng cụ cho sở thích",
        "Đồ phục vụ việc đi lại"
      ]
    ],
    [
      "{partner} thích cách theo dõi mục tiêu nào?",
      [
        "Đánh dấu mỗi ngày",
        "Nhìn kết quả theo tuần",
        "Nhờ một người nhắc nhẹ",
        "Không ghi, thấy tiến bộ là được"
      ]
    ],
    [
      "Nếu tự thưởng sau một tháng cố gắng, {owner} sẽ chọn gì?",
      [
        "Một bữa ăn ngon",
        "Mua món đã ngắm lâu",
        "Một buổi không phải làm gì",
        "Đi đâu đó đổi gió"
      ]
    ],
    [
      "Trong một kế hoạch đi chơi, {partner} muốn chốt điều gì trước?",
      [
        "Chi phí",
        "Ngày giờ",
        "Đi với ai",
        "Đến đó có gì ăn"
      ]
    ],
    [
      "Nếu thiết kế một phòng khách trong mơ, {owner} muốn ưu tiên món đồ nào nhất?",
      [
        "Chiếc sofa êm ái cực rộng nằm xem phim",
        "Dàn loa và TV màn hình lớn sắc nét",
        "Giá sách lớn từ sàn tới trần",
        "Cửa kính lớn nhìn ra ban công đầy cây xanh"
      ]
    ],
    [
      "{partner} thích phong cách thiết kế nội thất nào cho không gian sống?",
      [
        "Tối giản hiện đại ít đồ cho thoáng",
        "Ấm cúng nhiều gỗ phong cách Nhật hoặc Bắc Âu",
        "Cổ điển sang trọng tinh tế",
        "Tự do, miễn là tiện dụng và thoải mái"
      ]
    ],
    [
      "{owner} muốn nuôi con vật gì nhất trong ngôi nhà tương lai?",
      [
        "Một chú chó trung thành lăng xăng",
        "Một bạn mèo lười thích nằm cuộn tròn",
        "Một bể cá cảnh ngắm cho thư giãn",
        "Không nuôi gì cả, chăm mình còn chưa xong"
      ]
    ],
    [
      "Trong căn bếp tương lai, thiết bị nào {partner} muốn có nhất?",
      [
        "Máy rửa bát để giải phóng đôi bàn tay",
        "Nồi chiên không dầu và lò nướng xịn",
        "Máy pha cà phê tự động tại nhà",
        "Tủ lạnh hai cánh siêu to chứa cả thế giới đồ ăn"
      ]
    ],
    [
      "{owner} thích ngôi nhà tương lai nằm ở khu vực nào?",
      [
        "Trung tâm thành phố nhộn nhịp, bước xuống là có đồ ăn",
        "Khu đô thị ven đô yên tĩnh, nhiều cây xanh",
        "Một căn nhà nhìn ra bờ biển thoáng đãng",
        "Một ngôi nhà nhỏ trên đồi không khí mát lành"
      ]
    ],
    [
      "Nếu có một khu ban công rộng, {partner} sẽ biến nó thành gì?",
      [
        "Góc cà phê thư giãn ngắm phố",
        "Vườn rau xanh và hoa lá mini",
        "Nơi tập thể dục hoặc yoga đón nắng",
        "Chỗ giặt phơi và để đồ tiện ích"
      ]
    ],
    [
      "{owner} muốn dành khoản ngân sách đầu tư lớn nhất cho căn phòng nào?",
      [
        "Phòng ngủ để có giấc ngủ trọn vẹn nhất",
        "Phòng khách để tiếp đón bạn bè",
        "Căn bếp để nấu những bữa ăn ngon",
        "Phòng làm việc và giải trí cá nhân"
      ]
    ],
    [
      "{partner} nhìn nhận thế nào về việc phân chia việc nhà trong tương lai?",
      [
        "Chia đều theo danh sách rõ ràng, việc ai nấy làm",
        "Ai rảnh hoặc thấy việc trước thì tự giác làm",
        "Thuê dịch vụ hoặc dùng máy móc hỗ trợ tối đa",
        "Một người nấu cơm thì người kia rửa bát"
      ]
    ],
    [
      "{owner} mơ ước một chuyến du lịch xa trong vài năm tới ở đâu?",
      [
        "Khám phá cảnh sắc tuyết trắng hoặc mùa thu châu Âu",
        "Trải nghiệm ẩm thực và phố xá Nhật Bản hoặc Hàn Quốc",
        "Một chuyến trekking khám phá thiên nhiên hoang dã",
        "Nghỉ dưỡng tại resort biển sang trọng"
      ]
    ],
    [
      "{partner} muốn căn nhà tương lai sử dụng hệ thống nhà thông minh ở mức độ nào?",
      [
        "Tự động hóa toàn bộ bằng giọng nói và cảm biến",
        "Chỉ cần khóa cửa vân tay và robot hút bụi",
        "Thích công tắc cơ học truyền thống cho bền",
        "Có cũng được, không có cũng chẳng sao"
      ]
    ],
    [
      "Khi nghĩ về việc mua sắm đồ nội thất lớn, {owner} ưu tiên điều gì nhất?",
      [
        "Độ bền dùng được lâu dài nhiều năm",
        "Thẩm mỹ đẹp và hợp tông màu nhà",
        "Tiện ích đa năng, gập mở tiết kiệm diện tích",
        "Giá cả hợp lý vừa túi tiền"
      ]
    ],
    [
      "{partner} muốn dành buổi tối cuối tuần tại nhà để làm gì nhiều nhất?",
      [
        "Nấu một bữa ăn cầu kỳ rồi cùng nhau thưởng thức",
        "Nằm dài cày một bộ phim dài tập",
        "Mời bạn bè thân thiết về nhà tụ tập ăn uống",
        "Mỗi người một góc làm việc riêng trong yên bình"
      ]
    ],
    [
      "{owner} mong muốn có một góc riêng trong nhà dành cho sở thích gì?",
      [
        "Góc chơi game hoặc xem phim màn hình lớn",
        "Góc đọc sách và viết lách yên tĩnh",
        "Góc tập gym hoặc thể thao nhỏ gọn",
        "Góc chăm sóc cây cảnh và hoa lá"
      ]
    ],
    [
      "Nếu nhà có một phòng ngủ phụ còn trống, {partner} muốn tận dụng làm gì?",
      [
        "Phòng để quần áo và trang điểm riêng",
        "Phòng ngủ dành riêng cho khách hoặc người thân ghé chơi",
        "Phòng làm việc và đọc sách riêng biệt",
        "Phòng chứa đồ đạc đa năng"
      ]
    ],
    [
      "{owner} nghĩ sao về việc tự tay sơn tường hoặc tự đóng đồ trang trí cho nhà?",
      [
        "Rất hào hứng muốn tự làm trải nghiệm",
        "Mua sẵn hoặc thuê thợ cho chuẩn đẹp",
        "Làm mấy đồ nhỏ nhỏ thì được, việc nặng xin kiếu",
        "Chỉ nhận chân giám sát và cổ vũ tinh thần"
      ]
    ],
    [
      "{partner} thích mùi hương nào thoang thoảng trong không gian sống nhất?",
      [
        "Tinh dầu sả chanh hoặc bạc hà tươi mát",
        "Mùi gỗ trầm ấm hoặc quế dịu nhẹ",
        "Mùi hoa cỏ dịu ngọt tự nhiên",
        "Không mùi gì cả, nhà cửa thông thoáng sạch sẽ là được"
      ]
    ],
    [
      "{owner} muốn quản lý chi tiêu tài chính chung trong tương lai theo cách nào?",
      [
        "Lập một quỹ chung cho các chi phí lớn, còn lại tự do",
        "Công khai toàn bộ và cùng lên kế hoạch chi tiết",
        "Phân chia người lo khoản này, người lo khoản kia",
        "Cứ chi tiêu hợp lý, cuối tháng tổng kết một lần"
      ]
    ],
    [
      "Điều gì khiến {partner} cảm thấy một căn nhà thực sự trở thành tổ ấm?",
      [
        "Bếp luôn đỏ lửa và có đồ ăn nóng",
        "Cảm giác bước chân vào cửa là rũ bỏ được hết mệt mỏi",
        "Đầy ắp tiếng cười và những câu chuyện vụn vặt",
        "Có đủ những món đồ thân thuộc gắn liền với kỷ niệm"
      ]
    ],
    [
      "{owner} muốn tổ chức một bữa tiệc tân gia theo phong cách nào?",
      [
        "Bữa tiệc ấm cúng chỉ có vài người bạn cực kỳ thân thiết",
        "Mở tiệc nướng BBQ rôm rả ngoài trời",
        "Đặt đồ ăn về nhà quây quần nhẹ nhàng",
        "Rủ nhau đi ăn quán cho đỡ phải dọn dẹp bãi chiến trường"
      ]
    ],
    [
      "Trong 5 năm tới, mục tiêu nào {partner} muốn ưu tiên hoàn thành trước?",
      [
        "Ổn định công việc và tích lũy một khoản tài chính vững vàng",
        "Đi du lịch đến ít nhất 3 vùng đất mới",
        "Nâng cao sức khỏe và duy trì lối sống lành mạnh",
        "Tự thưởng cho mình một tài sản giá trị lớn"
      ]
    ]
  ],
  "funny": [
    [
      "Biết mình sẽ trễ hẹn mười lăm phút, {owner} thường làm gì?",
      [
        "Báo ngay giờ đến mới",
        "Gọi xin lỗi rồi đi tiếp",
        "Nhờ người kia gọi món trước",
        "Nhắn đang tới với tốc độ rất hối lỗi"
      ]
    ],
    [
      "Gọi nhầm món nhưng món đã lên, {partner} dễ xử lý thế nào?",
      [
        "Thử ăn nếu phù hợp",
        "Hỏi quán có đổi được không",
        "Đổi với người đồng ý",
        "Gọi thêm món khác"
      ]
    ],
    [
      "Đi nhầm đường, {owner} sẽ làm gì trước?",
      [
        "Dừng xem bản đồ",
        "Hỏi người gần đó",
        "Quay lại chỗ vừa rẽ",
        "Coi như được tham quan thêm một đoạn"
      ]
    ],
    [
      "Gửi nhầm ảnh vào cuộc trò chuyện, {partner} phản ứng thế nào?",
      [
        "Thu hồi rồi giải thích",
        "Nhắn xin lỗi ngay",
        "Kiểm tra xem ai đã đọc",
        "Đứng hình vài giây rồi mới xử lý"
      ]
    ],
    [
      "Chụp ảnh chung có người nhắm mắt, {owner} dễ chọn gì?",
      [
        "Chụp lại",
        "Chọn tấm khác",
        "Giữ làm ảnh hậu trường",
        "Hỏi mọi người có thấy ổn không"
      ]
    ],
    [
      "Đang ra ngoài thì trời đổ mưa, {partner} thường làm gì?",
      [
        "Tìm chỗ trú gần nhất",
        "Lấy áo mưa hoặc ô",
        "Đợi bớt mưa rồi đi",
        "Tìm quán nước tiện thể ngồi nghỉ"
      ]
    ],
    [
      "Thấy người giống người quen từ xa, {owner} sẽ làm gì?",
      [
        "Nhìn kỹ rồi mới chào",
        "Gọi tên thử",
        "Nhắn hỏi đang ở đâu",
        "Đi ngang để kiểm tra cho chắc"
      ]
    ],
    [
      "Quên tên người vừa được giới thiệu, {partner} sẽ làm gì?",
      [
        "Hỏi lại ngay",
        "Nhờ người khác nhắc nhỏ",
        "Chờ nghe ai đó gọi tên",
        "Nói chuyện tiếp rồi hỏi tên lần nữa"
      ]
    ],
    [
      "Quán quen hết đúng món định gọi, {owner} sẽ chọn gì?",
      [
        "Món gần giống nhất",
        "Nhờ quán gợi ý",
        "Đổi sang quán khác",
        "Đọc lại menu như lần đầu gặp mặt"
      ]
    ],
    [
      "Một bài nhạc rất quen vang lên, {partner} thường thế nào?",
      [
        "Hát theo nhỏ nhỏ",
        "Gõ nhịp",
        "Tìm tên bài để lưu",
        "Tự tin hát, lời tính sau"
      ]
    ],
    [
      "Lỡ làm đổ nước trên bàn, {owner} làm gì đầu tiên?",
      [
        "Lấy khăn lau",
        "Cứu điện thoại và đồ giấy",
        "Báo người phục vụ",
        "Xin lỗi rồi nhờ cùng dọn"
      ]
    ],
    [
      "Đặt đồ ăn thiếu một món, {partner} thường làm gì?",
      [
        "Liên hệ quán",
        "Kiểm tra lại đơn",
        "Ăn món có trước rồi xử lý",
        "Tìm món khác bù vào"
      ]
    ],
    [
      "Còn miếng cuối trên đĩa chung, {owner} thường làm gì?",
      [
        "Hỏi có ai muốn ăn không",
        "Chia nhỏ ra",
        "Để người khác lấy",
        "Nhận nhiệm vụ dọn đĩa nếu ai cũng nhường"
      ]
    ],
    [
      "Mở camera trước bất ngờ, {partner} dễ phản ứng thế nào?",
      [
        "Chỉnh lại tóc",
        "Đổi góc máy",
        "Tắt camera rồi mở lại",
        "Cười vì mặt mình chưa kịp chuẩn bị"
      ]
    ],
    [
      "Thấy món hàng giảm giá rất mạnh, {owner} làm gì trước?",
      [
        "Kiểm tra giá gốc",
        "Đọc đánh giá",
        "Xem mình có cần không",
        "Cho vào giỏ để suy nghĩ tiếp"
      ]
    ],
    [
      "Xem phim có đoạn đáng sợ, {partner} thường làm gì?",
      [
        "Xem tiếp bình thường",
        "Che mắt một chút",
        "Giảm tiếng",
        "Nhìn qua kẽ tay, vẫn đòi biết chuyện"
      ]
    ],
    [
      "Tìm điện thoại mãi không thấy, {owner} làm gì trước?",
      [
        "Nhờ gọi vào máy",
        "Tìm nơi vừa ngồi",
        "Kiểm tra túi áo và túi xách",
        "Đi lại hành trình vừa xong"
      ]
    ],
    [
      "Đang kể chuyện thì quên ý chính, {partner} sẽ làm gì?",
      [
        "Nhờ nhắc đoạn vừa kể",
        "Dừng nghĩ một chút",
        "Chuyển chuyện rồi nhớ lại sau",
        "Tuyên bố để phần hấp dẫn sang tập sau"
      ]
    ],
    [
      "Nhận cuộc gọi lúc đang ăn, {owner} thường làm gì?",
      [
        "Nuốt xong mới nghe",
        "Nhắn lát gọi lại",
        "Nghe nếu là chuyện gấp",
        "Để hết bữa rồi gọi lại"
      ]
    ],
    [
      "Mua đồ cần tự lắp, {partner} bắt đầu thế nào?",
      [
        "Đọc hướng dẫn",
        "Bày đủ bộ phận ra",
        "Xem video cách lắp",
        "Lắp thử rồi quay về đọc hướng dẫn"
      ]
    ],
    [
      "Đang đi giữa đường đông đúc thì dép bị đứt quai, {owner} sẽ làm gì?",
      [
        "Nhảy lò cò vào lề đường tìm chỗ mua dép mới",
        "Đi chân đất luôn coi như đang tiếp đất tự nhiên",
        "Tìm sợi thun hoặc dây buộc tạm rồi đi tiếp",
        "Đứng yên tại chỗ gọi cứu viện gấp"
      ]
    ],
    [
      "Vào nhà hàng sang trọng nhưng đọc menu không hiểu món nào, {partner} sẽ làm gì?",
      [
        "Chỉ vào món có hình ảnh nhìn ngon mắt nhất",
        "Nhờ bạn nhân viên gợi ý món dễ ăn nhất quán",
        "Chọn món có mức giá tầm trung cho an toàn",
        "Giả vờ xem menu rồi bảo người đi cùng gọi hộ"
      ]
    ],
    [
      "Đang trong cuộc họp nghiêm túc mà bụng reo to tướng một tiếng, {owner} sẽ phản ứng thế nào?",
      [
        "Giả vờ ho thật to để át đi tiếng động",
        "Tỏ vẻ mặt bình thản như thể âm thanh từ người bên cạnh",
        "Cười xòa nhận luôn bụng đòi ăn trưa rồi",
        "Cúi gằm mặt xuống sổ ghi chép lia lịa"
      ]
    ],
    [
      "Vô tình vẫy tay chào nhiệt tình nhưng nhận ra mình nhận nhầm người, {partner} xử lý sao?",
      [
        "Tiện tay vuốt tóc hoặc gãi đầu giả vờ không có gì",
        "Vẫy tiếp về phía sau coi như đang vẫy người khác",
        "Cười ngượng rồi bước thật nhanh đi chỗ khác",
        "Đứng hình tại chỗ ước có lỗ nẻ để chui xuống"
      ]
    ],
    [
      "Được tặng một món quà độc lạ nhưng không hợp gu, {owner} sẽ phản ứng thế nào trước mặt người tặng?",
      [
        "Khen nức nở tỏ vẻ thích thú để người tặng vui",
        "Cảm ơn lịch sự rồi cất kín vào góc tủ",
        "Cười gượng hỏi sao lại nghĩ ra món độc lạ này",
        "Thật thà bảo lần sau hỏi gu mình trước nhé"
      ]
    ],
    [
      "Đi mua sắm mà tiền trong tài khoản thiếu đúng vài nghìn đồng, {partner} sẽ làm gì ở quầy thu ngân?",
      [
        "Lục tung các túi tìm vài đồng tiền lẻ",
        "Bỏ lại món đồ rẻ nhất vừa chọn",
        "Mở app ngân hàng khác chuyển tiền gấp",
        "Nhìn người đi cùng với ánh mắt cầu cứu tha thiết"
      ]
    ],
    [
      "Đang đi bộ mà bị vấp chân suýt ngã giữa phố, {owner} sẽ phản ứng thế nào?",
      [
        "Lập tức chạy nhanh vài bước giả vờ đang tập chạy bộ",
        "Quay lại nhìn mặt đường xem có viên đá nào làm chứng không",
        "Tự bật cười một mình rồi đi tiếp",
        "Ngó quanh xem có ai vừa nhìn thấy không"
      ]
    ],
    [
      "Nhắn tin than thở về ai đó nhưng gửi nhầm thẳng vào người đó, {partner} xử lý sao?",
      [
        "Thu hồi trong vòng 1 giây với tốc độ ánh sáng",
        "Nhắn thêm vài câu bẻ lái sang chủ đề khác",
        "Tắt nguồn điện thoại coi như vừa biến mất khỏi trái đất",
        "Thú nhận thẳng thắn và gửi lời xin lỗi chân thành"
      ]
    ],
    [
      "Cố gắng mở nắp một lọ mứt đóng chặt nhưng không được, {owner} sẽ làm gì?",
      [
        "Dùng khăn lót, gõ nắp xuống bàn, áp dụng đủ mẹo vật lý",
        "Dùng hết sức bình sinh nghiến răng vặn tiếp",
        "Đưa cho người bên cạnh bảo mở hộ xem nào",
        "Bỏ cuộc, chuyển sang ăn món khác"
      ]
    ],
    [
      "Vô tình gặp người quen cũ khi đang mặc bộ đồ luộm thuộm nhất, {partner} sẽ làm gì?",
      [
        "Đeo khẩu trang, đội mũ kéo sụp xuống giả vờ không thấy",
        "Rẽ vội vào một con hẻm hoặc cửa hàng gần nhất",
        "Ngẩng cao đầu tự tin lướt qua như người xa lạ",
        "Cười chào một câu thật ngầu rồi đi tiếp"
      ]
    ],
    [
      "Đang hát say sưa trong phòng tắm thì phát hiện cửa phòng không đóng, {owner} sẽ làm gì?",
      [
        "Hát to hơn nữa để thị uy giọng hát",
        "Lập tức im bặt, ngượng ngùng bước ra khép cửa",
        "Hỏi vọng ra hát thế có hay bằng ca sĩ không",
        "Coi như không có chuyện gì xảy ra, hát nốt điệp khúc"
      ]
    ],
    [
      "Đi ra ngoài mà phát hiện mình mặc áo trái hoặc quên kéo khóa quần, {partner} xử lý ra sao?",
      [
        "Lẻn vào nhà vệ sinh chỉnh lại ngay lập tức",
        "Bình tĩnh khoác thêm áo khoác che lại",
        "Cầu nguyện nãy giờ không ai để ý",
        "Tự giác kể cho bạn thân nghe để cùng cười"
      ]
    ],
    [
      "Bị một con gián bay bất ngờ xông thẳng vào phòng, {owner} sẽ phản ứng thế nào?",
      [
        "Hét toáng lên nhảy tót lên ghế hoặc giường",
        "Cầm chổi hoặc dép truy đuổi diệt tận gốc",
        "Chạy ra khỏi phòng đóng chặt cửa cầu cứu",
        "Bình tĩnh thương lượng yêu cầu gián tự bay ra"
      ]
    ],
    [
      "Đi thử đồ trong shop mà cái áo bị kẹt vào đầu không chui ra được, {partner} sẽ làm gì?",
      [
        "Loay hoay tìm cách vùng vẫy trong hoảng loạn",
        "Đứng thở dốc vài giây bình tĩnh gỡ từng chút",
        "Gọi nhỏ nhân viên vào phòng thay đồ giải cứu",
        "Tự hỏi sao cái đầu mình hôm nay to thế"
      ]
    ],
    [
      "Uống một ngụm canh hoặc trà nóng bị bỏng lưỡi, {owner} sẽ phản ứng thế nào?",
      [
        "Thổi phù phù liên tục làm mát miệng",
        "Vội vàng với ngay cốc nước đá tu ừng ực",
        "Cố nuốt luôn với vẻ mặt nhăn nhó",
        "Há miệng phì phò than thở với người đối diện"
      ]
    ],
    [
      "Đang giả vờ ngủ để trốn làm việc nhà mà có người gọi đúng tên, {partner} sẽ làm gì?",
      [
        "Vẫn nhắm tịt mắt, giả vờ ngáy khò khò",
        "Từ từ mở mắt hỏi ủa ai gọi gì thế",
        "Tự giác dậy luôn vì biết đã bị phát hiện",
        "Lăn sang góc khác trùm chăn kín đầu"
      ]
    ],
    [
      "Thử một trend nhảy trên mạng nhưng kết quả nhìn vụng về kỳ cục, {owner} sẽ làm gì?",
      [
        "Xóa ngay lập tức không để lại dấu vết",
        "Lưu vào mục riêng tư chỉ mình xem để giải trí",
        "Đăng luôn làm nội dung hài tự dìm bản thân",
        "Gửi riêng cho đứa bạn thân nhất để cùng cười bò"
      ]
    ],
    [
      "Vào thang máy đông người mà điện thoại bỗng phát âm thanh lạ, {partner} sẽ làm gì?",
      [
        "Vội vàng ấn nút tắt âm thanh với vẻ mặt vô tội",
        "Nhìn ngó xung quanh như thể chuông của người khác",
        "Cười trừ bảo âm báo thức của em hơi vui nhộn",
        "Giả vờ đang có cuộc gọi quan trọng áp máy vào tai"
      ]
    ],
    [
      "Ăn món nhiều mùi xong phát hiện quên đem theo kẹo thơm miệng, {owner} sẽ làm gì?",
      [
        "Tìm ngay quán nước gọi trà đá súc miệng cấp tốc",
        "Hạn chế nói chuyện, thở nhẹ nhàng hết mức",
        "Rủ người đối diện ăn cùng cho thơm đều",
        "Ghé cửa hàng tiện lợi gần nhất mua kẹo"
      ]
    ],
    [
      "Bị người khác chụp lén lúc đang ngáp ngủ hoặc ăn uống nhồm nhoàm, {partner} sẽ phản ứng thế nào?",
      [
        "Đòi giật điện thoại xóa ngay lập tức",
        "Yêu cầu gửi ảnh qua để làm ảnh dìm hàng",
        "Canh lúc đối phương sơ hở chụp lại trả thù",
        "Cười chịu thua vì khoảnh khắc quá khó đỡ"
      ]
    ]
  ],
  "deep_soul": [
    [
      "Sau một ngày mệt, {owner} muốn điều gì trước tiên?",
      [
        "Yên tĩnh một lúc",
        "Có người nghe kể",
        "Ăn uống và nghỉ ngơi",
        "Làm gì đó để đổi tâm trạng"
      ]
    ],
    [
      "Khi kể chuyện bực mình, {partner} thường mong nhận được gì?",
      [
        "Được nghe cho hết",
        "Một lời khuyên cụ thể",
        "Một câu đồng cảm",
        "Một câu đùa đúng lúc"
      ]
    ],
    [
      "Muốn góp ý cho {owner}, cách nào dễ được đón nhận nhất?",
      [
        "Nói riêng và thẳng ý",
        "Đưa ví dụ cụ thể",
        "Hỏi lúc nào tiện nghe",
        "Nhắn trước để có thời gian nghĩ"
      ]
    ],
    [
      "Khi chưa trả lời tin nhắn, {partner} muốn người khác hiểu thế nào?",
      [
        "Có thể đang bận",
        "Đang cần nghĩ cách trả lời",
        "Chưa tiện mở máy",
        "Có việc gấp thì cứ gọi"
      ]
    ],
    [
      "{owner} cảm thấy được quan tâm nhất khi ai đó làm gì?",
      [
        "Nhớ điều từng kể",
        "Hỏi trước khi giúp",
        "Chủ động đỡ một việc",
        "Dành thời gian lắng nghe"
      ]
    ],
    [
      "Khi hai người hiểu lầm nhau, {partner} thích bắt đầu bằng cách nào?",
      [
        "Nói rõ chuyện đã xảy ra",
        "Nghe hết ý của nhau",
        "Nghỉ một chút rồi nói",
        "Nhắn một câu để mở lời"
      ]
    ],
    [
      "Một việc đang quá tải, {owner} dễ cần hỗ trợ gì nhất?",
      [
        "Chia bớt một phần việc",
        "Giúp sắp thứ tự ưu tiên",
        "Cho khoảng yên để làm",
        "Có người cùng ngồi xử lý"
      ]
    ],
    [
      "Lúc buồn mà chưa muốn kể, {partner} thích được đối xử thế nào?",
      [
        "Cho thời gian riêng",
        "Ngồi cùng nhưng không hỏi dồn",
        "Rủ làm việc nhẹ nhàng",
        "Nhắn sẵn sàng nghe khi muốn nói"
      ]
    ],
    [
      "{owner} thường nhận ra mình cần nghỉ nhờ dấu hiệu nào?",
      [
        "Khó tập trung",
        "Dễ cáu vì việc nhỏ",
        "Thấy buồn ngủ",
        "Không còn hứng làm việc thường thích"
      ]
    ],
    [
      "Lời xin lỗi nào có ý nghĩa nhất với {partner}?",
      [
        "Nói rõ đã sai ở đâu",
        "Nghe cảm xúc của người kia",
        "Sửa việc có thể sửa",
        "Lần sau làm khác đi"
      ]
    ],
    [
      "Khi quyết định việc khó, {owner} thường cần gì?",
      [
        "Thời gian tự nghĩ",
        "Người nghe để cùng gỡ",
        "Thông tin rõ hơn",
        "Thử một bước nhỏ trước"
      ]
    ],
    [
      "{partner} thích được động viên theo cách nào?",
      [
        "Nhắc điều đã làm tốt",
        "Giúp một việc cụ thể",
        "Tin tưởng cho tự làm",
        "Rủ nghỉ một chút rồi tiếp tục"
      ]
    ],
    [
      "Khi muốn từ chối một lời rủ, {owner} thường nói thế nào?",
      [
        "Nói thẳng là không tiện",
        "Giải thích ngắn lý do",
        "Đề xuất một dịp khác",
        "Cần nghĩ một lúc mới trả lời"
      ]
    ],
    [
      "Để thấy thoải mái trong nhóm mới, {partner} cần gì nhất?",
      [
        "Được giới thiệu với mọi người",
        "Có chủ đề dễ tham gia",
        "Không bị ép phải nói nhiều",
        "Có một người quen đi cùng"
      ]
    ],
    [
      "Sau khi làm xong một việc khó, {owner} muốn gì nhất?",
      [
        "Được nghỉ",
        "Có người ghi nhận",
        "Kể lại quá trình",
        "Chuyển sang việc nhẹ hơn"
      ]
    ],
    [
      "Điều nhỏ nào dễ khiến {partner} mất hứng nhất?",
      [
        "Bị ngắt lời liên tục",
        "Bị đổi hẹn không báo",
        "Bị trêu đúng điều không thích",
        "Bị giục khi đang cố làm"
      ]
    ],
    [
      "Khi {owner} nói cần ở một mình, điều đó thường để làm gì?",
      [
        "Nghỉ lấy lại sức",
        "Sắp xếp suy nghĩ",
        "Tập trung xong một việc",
        "Làm sở thích riêng"
      ]
    ],
    [
      "{partner} thích được hỏi thăm với tần suất nào?",
      [
        "Một chút mỗi ngày",
        "Vài lần mỗi tuần",
        "Khi có chuyện muốn chia sẻ",
        "Tùy giai đoạn bận hay rảnh"
      ]
    ],
    [
      "Nếu cần nhờ giúp, {owner} dễ mở lời bằng cách nào?",
      [
        "Nói thẳng việc đang cần",
        "Hỏi có rảnh không trước",
        "Tự thử rồi mới nhờ",
        "Viết tin nhắn rõ từng ý"
      ]
    ],
    [
      "Khi ý kiến khác nhau, {partner} ưu tiên điều gì?",
      [
        "Hiểu vì sao khác nhau",
        "Tìm phương án cả hai chấp nhận",
        "Thử từng cách nếu được",
        "Tạm dừng nếu đang quá căng"
      ]
    ],
    [
      "Khi {owner} cảm thấy mất phương hướng trong công việc, điều gì giúp lấy lại động lực nhất?",
      [
        "Một lời nhắc nhở về những thành tựu mình từng làm được",
        "Một buổi nói chuyện chân tình không phán xét",
        "Tạm gác lại mọi thứ nghỉ ngơi một vài ngày",
        "Lập lại kế hoạch từng bước cụ thể để giải quyết"
      ]
    ],
    [
      "{partner} thường bộc lộ sự quan tâm bằng hành động thầm lặng nào?",
      [
        "Chuẩn bị sẵn những món người kia cần trước khi kịp hỏi",
        "Lặng lẽ dọn dẹp hoặc làm đỡ việc đang dang dở",
        "Chú ý đến những thay đổi nhỏ trong nét mặt hoặc giọng nói",
        "Nhắc nhở nhẹ nhàng về ăn uống, nghỉ ngơi"
      ]
    ],
    [
      "Điều gì dễ khiến {owner} cảm thấy tổn thương trong một cuộc tranh luận?",
      [
        "Bị đối phương lặp lại những lỗi lầm cũ trong quá khứ",
        "Thái độ thờ ơ, im lặng né tránh vấn đề",
        "Bị ngắt lời và phủ nhận cảm xúc của mình",
        "Những lời nói nặng nề lúc mất bình tĩnh"
      ]
    ],
    [
      "Khi {partner} im lặng không muốn nói chuyện, lý do lớn nhất thường là gì?",
      [
        "Cần thời gian riêng để tự xử lý cảm xúc tiêu cực",
        "Đang sợ nói ra lúc nóng giận sẽ làm tổn thương người khác",
        "Quá mệt mỏi không còn đủ năng lượng để giải thích",
        "Đang chờ đối phương nhận ra và chủ động hỏi han"
      ]
    ],
    [
      "{owner} cảm thấy an tâm nhất khi người đồng hành có phẩm chất nào?",
      [
        "Trung thực và luôn rõ ràng trong mọi chuyện",
        "Điềm tĩnh, biết lắng nghe lúc khó khăn",
        "Có trách nhiệm và giữ đúng lời hứa",
        "Tốt bụng và luôn tôn trọng không gian riêng của nhau"
      ]
    ],
    [
      "Cách tốt nhất để {partner} cảm nhận được tình cảm chân thành là gì?",
      [
        "Những hành động chăm sóc nhỏ hằng ngày",
        "Lời nói ngọt ngào và những cái ôm ấm áp",
        "Sự ưu tiên về thời gian dành cho nhau",
        "Cùng nhau đồng hành vượt qua những giai đoạn gian nan"
      ]
    ],
    [
      "Khi {owner} gặp áp lực về tài chính hoặc công việc, họ muốn người kia đối xử ra sao?",
      [
        "Động viên tinh thần và tin tưởng vào khả năng của mình",
        "Cùng ngồi tính toán và tìm giải pháp thực tế",
        "Chia sẻ bớt những chi tiêu hằng ngày một cách tế nhị",
        "Không tạo thêm áp lực hay so sánh với người khác"
      ]
    ],
    [
      "{partner} thường tha thứ cho một lỗi lầm khi đối phương làm điều gì?",
      [
        "Chân thành nhận lỗi và không tái phạm lần sau",
        "Cho thấy sự thay đổi tích cực qua hành động cụ thể",
        "Biết lắng nghe cảm xúc tổn thương của mình",
        "Một lời xin lỗi ấm áp kèm cái ôm giảng hòa"
      ]
    ],
    [
      "Điều gì khiến {owner} cảm thấy tự hào nhất về bản thân trong những năm gần đây?",
      [
        "Đã kiên cường vượt qua những giai đoạn chông chênh",
        "Học được cách tự chăm sóc và yêu thương chính mình",
        "Đạt được những cột mốc mục tiêu đã đặt ra",
        "Luôn giữ được sự chân thành với những người mình yêu quý"
      ]
    ],
    [
      "Khi {partner} phải đưa ra một quyết định lớn thay đổi cuộc sống, họ dựa vào đâu nhiều nhất?",
      [
        "Lý trí và phân tích các mặt lợi hại cẩn thận",
        "Trực giác và cảm xúc mách bảo",
        "Lời khuyên từ những người thân tín nhất",
        "Cân nhắc xem quyết định đó có mang lại bình an lâu dài không"
      ]
    ],
    [
      "{owner} thường làm gì để tự chữa lành cảm xúc sau một tuần căng thẳng?",
      [
        "Ngủ một giấc thật sâu không đặt báo thức",
        "Ăn những món ngon mình thích và xem phim",
        "Dành thời gian một mình viết nhật ký hoặc nghe nhạc",
        "Đi dạo ngoài trời hít thở không khí tự nhiên"
      ]
    ],
    [
      "{partner} trân trọng điều gì nhất ở một người bạn hoặc người đồng hành lâu năm?",
      [
        "Dù có chuyện gì xảy ra vẫn luôn đứng về phía mình",
        "Hiểu được cả những điều mình chưa kịp nói ra",
        "Chấp nhận và yêu quý cả những khuyết điểm của nhau",
        "Cùng nhau cười nhiều hơn là cùng nhau thở dài"
      ]
    ],
    [
      "Khi {owner} muốn từ bỏ một mục tiêu vì quá mệt, họ mong nhận được lời khuyên nào?",
      [
        "Mệt thì nghỉ một chút rồi tính tiếp, đừng vội bỏ",
        "Nếu đã cố hết sức thì dừng lại cũng không sao cả",
        "Hãy nhớ lại lý do vì sao ngày trước bắt đầu",
        "Cứ làm điều khiến bạn thấy thoải mái nhất"
      ]
    ],
    [
      "{partner} đối diện với nỗi sợ hãi hoặc bất an bằng cách nào?",
      [
        "Tìm hiểu thật kỹ về nỗi sợ đó để kiểm soát nó",
        "Tâm sự với người mình tin tưởng nhất để giải tỏa",
        "Tập trung vào những việc tích cực khác để quên đi",
        "Học cách chấp nhận sự không hoàn hảo của cuộc sống"
      ]
    ],
    [
      "{owner} cảm thấy mối quan hệ gắn kết bền chặt nhất qua điều gì?",
      [
        "Cùng nhau trải qua những chuyện buồn vui trong đời",
        "Những cuộc trò chuyện sâu sắc lúc đêm muộn",
        "Sự thấu hiểu và tôn trọng lối sống của nhau",
        "Cảm giác luôn có một nơi chốn an toàn để trở về"
      ]
    ],
    [
      "Khi có chuyện buồn, {partner} thường tìm đến ai trước tiên?",
      [
        "Người yêu hoặc người bạn thân nhất",
        "Gia đình thân yêu",
        "Giữ trong lòng tự mình vượt qua",
        "Viết ra sổ hoặc xả vào một không gian riêng"
      ]
    ],
    [
      "{owner} định nghĩa sự thành công trong cuộc sống hiện tại là gì?",
      [
        "Bình an trong tâm hồn và sức khỏe tốt",
        "Có công việc mình yêu thích và thu nhập ổn định",
        "Được ở bên cạnh những người mình yêu thương",
        "Tự do làm những điều mình mong muốn"
      ]
    ],
    [
      "Điều gì khiến {partner} dễ xúc động và rơi nước mắt nhất?",
      [
        "Những câu chuyện về tình cảm gia đình ấm áp",
        "Nhìn thấy người thân yêu phải chịu vất vả",
        "Một cử chỉ ân cần bất ngờ khi mình đang kiệt sức",
        "Một bộ phim hoặc bản nhạc chạm đúng tâm trạng"
      ]
    ],
    [
      "Khi {owner} cảm thấy bất đồng quan điểm sâu sắc với người kia, họ sẽ chọn cách nào?",
      [
        "Chờ cả hai bình tĩnh rồi ngồi lại nói chuyện thẳng thắn",
        "Đồng ý rằng cả hai có thể có góc nhìn khác nhau",
        "Nhường nhịn một bước nếu chuyện không quá nghiêm trọng",
        "Tìm điểm chung ở giữa để cả hai cùng vui vẻ"
      ]
    ],
    [
      "Lời động viên nào có sức mạnh lớn nhất đối với {partner} trong những ngày khó khăn?",
      [
        "Luôn có mình ở đây bên cạnh bạn",
        "Bạn đã làm rất tốt rồi, đừng quá khắt khe với bản thân",
        "Mọi chuyện rồi sẽ ổn thỏa cả thôi",
        "Tự hào về bạn rất nhiều"
      ]
    ]
  ]
};

// Replace once: names containing token-like text must remain literal.
export function formatMatchQuestion(text, ownerName, partnerName) {
  const names = { owner: ownerName?.trim() || '[Tên người tạo]', partner: partnerName?.trim() || '[Tên người được mời]' };
  if (names.owner.toLocaleLowerCase('vi') === names.partner.toLocaleLowerCase('vi')) {
    names.owner += ' (người tạo)';
    names.partner += ' (người được mời)';
  }
  return text.replace(/\{(owner|partner)\}/g, (_, role) => names[role]);
}

export const QUESTION_POOL=Object.fromEntries(Object.entries(packs).map(([id,rows])=>[id,rows.map(([text,options])=>({text,options}))]));

function shuffle(items) {
  const result=[...items];
  for(let i=result.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
export function getTopicQuestions(topicId='lifestyle',count=5,excludeTexts=[]) {
  const pool=QUESTION_POOL[topicId]||QUESTION_POOL.lifestyle, excluded=new Set(excludeTexts);
  return [...shuffle(pool.filter(q=>!excluded.has(q.text))),...shuffle(pool.filter(q=>excluded.has(q.text)))]
    .slice(0,count).map((q,i)=>({...q,id:i+1,options:[...q.options],image_path:null}));
}
export function getRandomReplacement(topicId='lifestyle',currentTexts=[]) {
  return getTopicQuestions(topicId,1,currentTexts)[0];
}
export function getComplementaryInsight(questionText='',ownerAnswer='',partnerAnswer='',ownerName='Người tạo',partnerName='Người được mời') {
  return {title:'Một chuyện để hỏi thêm',badge:'Đoán khác nhau cũng vui 💬',
    advice:`${ownerName} chọn “${ownerAnswer}”, ${partnerName} chọn “${partnerAnswer}”. Cùng kể lý do nhé. Một câu đoán khác không nói lên mức độ thân thiết!`};
}
const playedHistory=new Map();
export function getPlayedQuestions(userId='default') {
  if(!playedHistory.has(userId)) {
    try {
      const saved=JSON.parse(globalThis.localStorage?.getItem(`emoria-match-played:${userId}`)||'[]');
      playedHistory.set(userId,new Set(Array.isArray(saved)?saved.filter(t=>typeof t==='string'):[]));
    } catch { playedHistory.set(userId,new Set()); }
  }
  return [...playedHistory.get(userId)];
}
export function recordPlayedQuestions(userId='default',texts=[]) {
  const saved=[...new Set([...getPlayedQuestions(userId),...texts.filter(t=>typeof t==='string')])].slice(-500);
  playedHistory.set(userId,new Set(saved));
  try { globalThis.localStorage?.setItem(`emoria-match-played:${userId}`,JSON.stringify(saved)); } catch { /* Play works without browser storage. */ }
}
