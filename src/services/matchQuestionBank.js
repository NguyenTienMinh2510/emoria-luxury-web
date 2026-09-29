/**
 * EMORIA Couple Match - Question Bank & Vibe Check Engine
 * Cung cấp 5 chủ đề phong phú, bốc ngẫu nhiên thông minh chống lặp,
 * và biến mismatch thành "Mảnh ghép bù trừ" ngọt ngào.
 */

export const MATCH_TOPICS = [
  {
    id: 'romance',
    title: 'Rung Động & Lãng Mạn',
    emoji: '💖',
    tagline: 'Khoảnh khắc đầu tiên & cảm xúc sâu thẳm',
    color: 'from-rose-500/20 to-pink-500/10 border-rose-500/30 text-rose-300'
  },
  {
    id: 'lifestyle',
    title: 'Thói Quen & Đời Thường',
    emoji: '☕',
    tagline: 'Sở thích, món ăn & tật xấu đáng yêu',
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300'
  },
  {
    id: 'future_home',
    title: 'Ngôi Nhà & Tương Lai',
    emoji: '🏡',
    tagline: 'Tổ ấm trong mơ & kế hoạch bên nhau',
    color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300'
  },
  {
    id: 'funny',
    title: 'Tình Huống Hóc Búa',
    emoji: '🎭',
    tagline: 'Lạc đường, trễ hẹn & phản ứng dở khóc dở cười',
    color: 'from-violet-500/20 to-purple-500/10 border-violet-500/30 text-violet-300'
  },
  {
    id: 'deep_soul',
    title: 'Thấu Hiểu Tâm Hồn',
    emoji: '🌙',
    tagline: 'Ngôn ngữ tình yêu & vỗ về tổn thương',
    color: 'from-sky-500/20 to-indigo-500/10 border-sky-500/30 text-sky-300'
  }
];

export const QUESTION_POOL = {
  romance: [
    {
      text: 'Khoảnh khắc nào khiến bạn nhận ra mình đã thực sự "đổ gục" trước người ấy?',
      options: ['Ánh mắt dịu dàng bất ngờ chạm nhau', 'Hành động chăm sóc âm thầm không nói trước', 'Nụ cười rạng rỡ làm sáng bừng không gian', 'Một câu nói vu vơ nhưng chạm đúng tâm tư']
    },
    {
      text: 'Điều lãng mạn nhất mà đối phương từng làm cho bạn là gì?',
      options: ['Bất ngờ xuất hiện khi bạn đang mệt mỏi nhất', 'Một món quà nhỏ mang ý nghĩa kỷ niệm riêng', 'Bức thư tay hoặc tin nhắn dài ấm áp lúc nửa đêm', 'Một bữa ăn tự tay nấu vụng về nhưng tràn đầy tình cảm']
    },
    {
      text: 'Giai điệu nào gợi nhắc bạn nhớ nhất về tình yêu của hai bạn?',
      options: ['Bản tình ca acoustic êm đềm mộc mạc', 'Bài hát cả hai vô tình nghe chung trong chuyến đi đầu tiên', 'Giai điệu trong bộ phim từng xem cùng nhau dưới mưa', 'Một bài hát sôi động cả hai hay ngân nga khi ngồi xe']
    },
    {
      text: 'Nụ hôn đáng nhớ nhất của hai bạn diễn ra ở đâu?',
      options: ['Dưới cơn mưa rào bất chợt', 'Góc ban công lộng gió buổi hoàng hôn', 'Trong rạp phim lúc đèn vừa tắt', 'Trước hiên nhà lúc chia tay sau buổi hẹn']
    },
    {
      text: 'Cử chỉ ngọt ngào nào của đối phương khiến tim bạn đập nhanh nhất?',
      options: ['Xoa đầu hoặc vén tóc nhẹ nhàng', 'Bất ngờ siết chặt tay giữa phố đông người', 'Cái ôm từ phía sau ấm áp', 'Hôn nhẹ lên trán trước khi tạm biệt']
    },
    {
      text: 'Nếu được quay lại một ngày kỷ niệm, bạn muốn sống lại ngày nào nhất?',
      options: ['Buổi hẹn hò chính thức đầu tiên bỡ ngỡ', 'Khoảnh khắc nhận lời yêu nhau', 'Chuyến du lịch xa đầu tiên chỉ có hai người', 'Một ngày bình thường nhưng đầy ắp tiếng cười']
    },
    {
      text: 'Điều gì ở đối phương khiến bạn cảm thấy tự hào nhất khi giới thiệu với bạn bè?',
      options: ['Sự tử tế và cách đối nhân xử thế ấm áp', 'Sự hài hước duyên dáng làm mọi người vui vẻ', 'Nụ cười tỏa nắng và vẻ ngoài thu hút', 'Sự chăm chỉ và đam mê trong công việc']
    },
    {
      text: 'Biệt danh bí mật mà bạn thầm thích gọi đối phương là gì?',
      options: ['Tên gọi đáng yêu gắn với thú cưng (Mèo con, Cún con)', 'Cách gọi ngọt ngào quen thuộc (Em iu, Anh iu)', 'Tên viết tắt hoặc biệt danh riêng chỉ hai đứa biết', 'Một biệt danh trêu chọc hài hước']
    },
    {
      text: 'Lời khen nào từ người ấy khiến bạn nhớ mãi không quên?',
      options: ['"Ở bên cạnh em/anh, anh/em cảm thấy bình yên nhất"', '"Em/anh là điều may mắn nhất trong đời anh/em"', '"Hôm nay em/anh xinh đẹp / bảnh bao lắm"', '"Cảm ơn vì đã luôn hiểu anh/em"']
    },
    {
      text: 'Món quà kỷ niệm ý nghĩa nhất bạn muốn tặng đối phương vào dịp tới?',
      options: ['Một món trang sức kỷ niệm mang dấu ấn riêng', 'Một chuyến đi xa chỉ có hai đứa', 'Một album ảnh tự làm ghi lại từng chặng đường', 'Một bữa tối tự nấu dưới ánh nến ấm cúng']
    },
    {
      text: 'Khi nhìn vào mắt người ấy, bạn nhìn thấy điều gì rõ nhất?',
      options: ['Sự an toàn và che chở vô điều kiện', 'Tình yêu nồng nhiệt và chân thành', 'Cả tương lai tươi sáng phía trước', 'Hình bóng phản chiếu của chính mình']
    },
    {
      text: 'Nếu tình yêu của hai bạn là một loài hoa, đó sẽ là hoa gì?',
      options: ['Hoa hồng đỏ rực cháy đam mê', 'Hoa baby trắng tinh khôi và bình yên', 'Hoa hướng dương luôn hướng về ánh sáng', 'Hoa oải hương thủy chung và sâu lắng']
    }
  ],

  lifestyle: [
    {
      text: 'Món ăn nào cả hai luôn muốn gọi mỗi khi đi ăn cùng nhau?',
      options: ['Đồ nướng lẩu nóng hổi xuýt xoa', 'Món ăn đường phố quen thuộc bên góc vỉa hè', 'Bữa tối lãng mạn phong cách phương Tây', 'Đồ ngọt, trà sữa hoặc chè thanh mát']
    },
    {
      text: 'Buổi sáng lý tưởng của hai bạn vào ngày nghỉ sẽ diễn ra như thế nào?',
      options: ['Ngủ nướng đã đời rồi dậy cùng ăn brunch trễ', 'Dậy sớm đón bình minh rồi đi cà phê góc phố quen', 'Cùng nhau chuẩn bị bữa sáng ấm cúng tại nhà', 'Vận động thể thao nhẹ nhàng rồi đi dạo']
    },
    {
      text: 'Khi đối phương giận dỗi đáng yêu, "chiêu" dỗ dành nào hiệu quả nhất?',
      options: ['Mua ngay món ăn hoặc trà sữa người ấy mê', 'Ôm chặt không buông cho đến khi chịu cười', 'Chân thành nói lời xin lỗi kèm gương mặt ăn năn', 'Làm trò hề hài hước để người ấy bật cười']
    },
    {
      text: 'Khi cả hai có 3 tiếng thảnh thơi vào chiều Chủ nhật, bạn sẽ chọn gì?',
      options: ['Cùng nằm sofa xem một bộ phim hay', 'Đi dạo siêu thị mua sắm đồ ăn vặt', 'Mỗi người một góc yên tĩnh đọc sách cạnh nhau', 'Chạy xe lòng vòng ngắm phố xá hoàng hôn']
    },
    {
      text: 'Tật xấu nào của đối phương mà bạn thấy vừa buồn cười vừa thương?',
      options: ['Hay quên chìa khóa hoặc đồ đạc lung tung', 'Lúc đói bụng thì càu nhàu như đứa trẻ', 'Thức khuya lướt điện thoại rồi sáng dậy than mệt', 'Chọn đồ lâu ơi là lâu mỗi khi ra ngoài']
    },
    {
      text: 'Phong cách chi tiêu khi đi chơi chung của hai bạn là gì?',
      options: ['Lên kế hoạch dự trù cẩn thận từ trước', 'Cứ thoải mái tận hưởng, quan trọng là niềm vui', 'Săn deal giảm giá thông minh', 'Tùy hứng, lúc tiết kiệm lúc sang chảnh']
    },
    {
      text: 'Thức uống nào đối phương chọn chuẩn xác nhất cho bạn khi không cần hỏi?',
      options: ['Cà phê đậm vị hoặc bạc xỉu ít ngọt', 'Trà sữa ít đường nhiều trân châu', 'Nước ép hoa quả thanh mát', 'Trà thảo mộc ấm áp']
    },
    {
      text: 'Ai là người thường mở lời làm hòa trước sau mỗi lần tranh cãi nhỏ?',
      options: ['Người có lỗi rõ hơn sẽ tự giác mở lời', 'Người yêu đối phương nhiều hơn một chút', 'Cả hai cùng im lặng rồi tự nhiên cười xòa', 'Gửi một meme hài hước để phá vỡ băng tuyết']
    },
    {
      text: 'Khi đi du lịch chung, ai là người đóng vai trò "hoa tiêu kiêm thủ quỹ"?',
      options: ['Bạn là người lên lịch trình và quản lý chi tiêu', 'Người ấy chu đáo quán xuyến mọi thứ', 'Chia đôi nhiệm vụ: người lái xe, người lo ăn uống', 'Đi theo hệ tự do, tới đâu hay tới đó']
    },
    {
      text: 'Mùi hương nào trên người đối phương khiến bạn cảm thấy thân thuộc nhất?',
      options: ['Mùi nước hoa nhẹ nhàng tinh tế', 'Mùi dầu gội thơm mát quen thuộc', 'Mùi nước giặt quần áo sạch sẽ ấm áp', 'Mùi tự nhiên đặc trưng của riêng người ấy']
    },
    {
      text: 'Khi đối phương bị ốm hoặc mệt, bạn thường chăm sóc bằng cách nào?',
      options: ['Nấu một bát cháo nóng hoặc canh bồi bổ', 'Chuẩn bị thuốc, nước ấm và túc trực bên cạnh', 'Xoa bóp, đắp khăn mát và hỏi han dịu dàng', 'Giữ không gian yên tĩnh tuyệt đối cho người ấy ngủ']
    },
    {
      text: 'Thể loại phim nào cả hai thường chọn khi xem chung ở nhà?',
      options: ['Phim hài hước lãng mạn (Rom-Com)', 'Phim hành động kịch tính hoặc siêu anh hùng', 'Phim trinh thám giật gân đấu trí', 'Phim hoạt hình đáng yêu nhẹ nhàng']
    }
  ],

  future_home: [
    {
      text: 'Không gian quan trọng nhất trong tổ ấm tương lai của hai bạn là gì?',
      options: ['Góc bếp ấm cúng với bàn ăn ngập nắng', 'Phòng khách êm ái với màn hình chiếu phim lớn', 'Phòng ngủ yên bình với nệm êm ánh sáng dịu', 'Ban công xanh mát với nhiều hoa lá và bàn trà nhỏ']
    },
    {
      text: 'Trong ngôi nhà tương lai, hai bạn có muốn nuôi thú cưng không?',
      options: ['Một chú mèo lười tròn xoe thích được ôm', 'Một chú cún trung thành lăng xăng đón cửa', 'Nuôi cả cún lẫn mèo cho nhà cửa rộn ràng', 'Chỉ có hai đứa và nhiều cây xanh thanh bình']
    },
    {
      text: 'Phân chia việc nhà lý tưởng nhất theo bạn sẽ như thế nào?',
      options: ['Một người nấu ăn ngon, một người rửa bát sạch', 'Cùng nhau làm việc nhà vào sáng cuối tuần có bật nhạc', 'Ai rảnh hơn hoặc thấy việc thì tự giác làm', 'Thuê dịch vụ dọn dẹp để dành thời gian yêu nhau']
    },
    {
      text: 'Tông màu chủ đạo bạn muốn phủ lên ngôi nhà chung của hai đứa?',
      options: ['Trắng kem & gỗ sồi ấm cúng phong cách Bắc Âu', 'Xám đen hiện đại sang trọng và tối giản', 'Pastel nhẹ nhàng lãng mạn như quán cà phê Hàn Quốc', 'Tông màu thiên nhiên xanh mướt mát mắt']
    },
    {
      text: 'Vào một buổi tối mùa đông trong ngôi nhà riêng, hai bạn sẽ làm gì?',
      options: ['Cùng cuộn mình trong chăn ấm xem Netflix', 'Nấu nồi lẩu nóng hổi rồi vừa ăn vừa tâm sự', 'Ngồi nhâm nhi tách trà nóng nghe nhạc không lời', 'Cùng chơi board game hoặc game đối kháng']
    },
    {
      text: 'Vật dụng trang trí nào nhất định phải có trong phòng ngủ của hai bạn?',
      options: ['Khung ảnh kỷ niệm ghi dấu ngày cưới hoặc kỷ niệm', 'Đèn ngủ ánh vàng ấm áp tạo cảm giác êm dịu', 'Một chiếc máy phát nhạc đĩa than cổ điển', 'Máy xông tinh dầu tỏa hương lavender thư giãn']
    },
    {
      text: 'Bạn hình dung chuyến đi kỷ niệm 5 năm bên nhau sẽ là chuyến đi thế nào?',
      options: ['Một resort biệt lập bên bờ biển xanh ngắt', 'Khám phá châu Âu cổ kính lãng mạn', 'Cắm trại trên thảo nguyên hoặc ngọn đồi sương mù', 'Trở lại đúng nơi hai đứa bắt đầu hẹn hò']
    },
    {
      text: 'Khi về già, bạn muốn cùng người ấy sống ở đâu nhất?',
      options: ['Một ngôi nhà nhỏ ven biển ngắm sóng vỗ', 'Một căn nhà gỗ trên đồi hoa bình yên Đà Lạt', 'Một căn hộ tiện nghi giữa thành phố sôi động', 'Một trang trại nhỏ tự trồng rau và nuôi gà']
    },
    {
      text: 'Thói quen nhỏ nào bạn muốn hai người duy trì mỗi ngày khi về chung một nhà?',
      options: ['Hôn tạm biệt trước khi đi làm và đón chào lúc về', 'Cùng ngồi ăn cơm tối và kể cho nhau nghe về một ngày', 'Cùng uống cà phê sáng trước khi bắt đầu ngày mới', 'Nắm tay nhau đi dạo buổi tối quanh khu phố']
    },
    {
      text: 'Điều gì bạn nghĩ sẽ là thử thách lớn nhất khi bắt đầu sống chung?',
      options: ['Điều chỉnh những thói quen sinh hoạt vụn vặt khác nhau', 'Học cách nhường nhịn khi bất đồng quan điểm', 'Cân đối giữa thời gian cho nhau và không gian riêng tư', 'Chia sẻ trách nhiệm tài chính gia đình']
    },
    {
      text: 'Một góc nhỏ bạn muốn dành riêng cho người ấy trong nhà là gì?',
      options: ['Bàn làm việc yên tĩnh với dàn máy tính xịn', 'Bàn trang điểm lộng lẫy ngập tràn ánh sáng', 'Góc đọc sách thư giãn có sofa bập bênh', 'Khu vườn nhỏ cho người ấy chăm sóc cây cỏ']
    },
    {
      text: 'Khi nghĩ về mái ấm tương lai, cảm xúc nào xuất hiện trong bạn đầu tiên?',
      options: ['Cảm giác an toàn và được che chở', 'Sự háo hức chờ đón những niềm vui mới', 'Trách nhiệm xây đắp hạnh phúc dài lâu', 'Sự bình yên sâu lắng trong tâm hồn']
    }
  ],

  funny: [
    {
      text: 'Khi đi lạc đường trong lúc đang đi chơi, ai sẽ là người nhận lỗi trước?',
      options: ['Người cầm lái nhận tội: "Anh/Em nhìn nhầm biển báo"', 'Người chỉ đường cãi cùn: "Tại Google Maps nó bảo thế!"', 'Cả hai cùng cười trừ rồi ghé vào quán nước gần đó', 'Đổ lỗi cho nhau hài hước rồi lại cùng vui vẻ']
    },
    {
      text: 'Khi đối phương bảo "Ăn gì cũng được", bạn hiểu câu đó có nghĩa là gì?',
      options: ['"Nghĩ ra món đúng ý tôi đi, đoán sai là biết tay!"', ['Ăn gì thật cũng được, miễn là được ăn cùng bạn'], ['"Tôi đang đói lả rồi, quyết nhanh giùm cái!"'], ['"Tôi muốn ăn món quen nhưng đợi bạn gợi ý"']]
    },
    {
      text: 'Nếu bất ngờ trúng số độc đắc 10 tỷ, điều điên rồ đầu tiên hai bạn làm là gì?',
      options: ['Nộp đơn xin nghỉ việc ngay trong ngày rồi đi du lịch vòng quanh thế giới', 'Mua ngay căn hộ trong mơ và sắm đồ đạc không nhìn giá', 'Gửi tiết kiệm 9 tỷ, 1 tỷ còn lại đi ăn sạch hàng quán yêu thích', 'Bao trọn một nhà hàng sang trọng chỉ để ăn món vỉa hè yêu thích']
    },
    {
      text: 'Khi người ấy hát karaoke lệch tông một cách nhiệt tình, bạn sẽ làm gì?',
      options: ['Hát bè lệch tông theo cho vui cả đôi', 'Quay lén video làm bằng chứng dìm hàng sau này', 'Vỗ tay nhiệt liệt như fan cuồng số một', 'Cười nghiêng ngả không kìm được']
    },
    {
      text: 'Tình huống nào sau đây khiến cả hai xấu hổ nhất nhưng giờ nghĩ lại cười bò?',
      options: ['Vẫy tay nhiệt tình chào nhầm người lạ trước mặt người ấy', 'Bị trượt chân ngã ngố tàu lúc đang cố tạo dáng ngầu', 'Bụng sôi ùng ục giữa khoảnh khắc lãng mạn tĩnh lặng', 'Quên mang ví lúc thanh toán bữa ăn hẹn hò']
    },
    {
      text: 'Nếu bị biến thành một loài động vật trong 24 giờ, bạn nghĩ người ấy sẽ là con gì?',
      options: ['Con mèo chảnh chọe lúc thích thì nũng nịu, lúc ghét thì cào', 'Chú cún ngơ ngác trung thành luôn vẫy đuôi chờ bạn', 'Chú gấu trúc tròn xoe chỉ thích ăn với ngủ', 'Chú sóc lăng xăng nghịch ngợm không chịu ngồi yên']
    },
    {
      text: 'Ai là người dễ bị "dụ dỗ" mua đồ không cần thiết nhất khi đi mua sắm?',
      options: ['Chính bạn - thấy đồ xinh là mủi lòng rút ví', 'Người ấy - hay bị nhân viên tư vấn thuyết phục', 'Cả hai người cùng đồng lòng mua đồ vô tri', 'Không ai cả, hai bạn đều là bậc thầy kiềm chế']
    },
    {
      text: 'Khi chụp ảnh chung, điều gì thường xảy ra nhất?',
      options: ['Chụp 100 tấm mới chọn được 1 tấm ưng ý', 'Một người luôn tạo dáng nghiêm túc, người kia làm mặt xấu', 'Cả hai cười phá lên không chụp tử tế được tấm nào', 'Chụp tấm nào đẹp ngay tấm đó vì quá đẹp đôi']
    },
    {
      text: 'Nếu người ấy lỡ làm cháy nồi đồ ăn khi cố gắng nấu cho bạn, bạn sẽ?',
      options: ['Ăn hết phần chưa cháy và khen lấy khen để nỗ lực', 'Chụp ảnh lại trêu chọc rồi đặt đồ ăn ngoài về ăn chung', 'Lao vào dọn dẹp và cùng nấu lại món mới', 'Cười ôm người ấy vỗ về: "Lần sau để anh/em nấu!"']
    },
    {
      text: 'Ai là người hay ngủ ngáy hoặc nói mớ hài hước hơn?',
      options: ['Bạn - thỉnh thoảng có những câu nói mớ không ai hiểu nổi', 'Người ấy - ngáy ro ro như máy bay phản lực', 'Cả hai cùng nhau hòa tấu bản giao hưởng đêm khuya', 'Cả hai đều ngủ ngoan như thiên thần']
    },
    {
      text: 'Khi đối phương diện một bộ đồ hơi "kỳ cục", bạn sẽ phản ứng thế nào?',
      options: ['Góp ý thẳng thắn nhưng khéo léo để người ấy đổi đồ', 'Khen hài hước: "Trông độc lạ đấy, rất phong cách!"', 'Nhịn cười và âm thầm nhìn ngắm sự đáng yêu đó', 'Mặc đồ cùng phong cách kỳ lạ cho đồng bộ']
    },
    {
      text: 'Trận chiến tranh giành đồ ăn cuối cùng trên đĩa thường kết thúc ra sao?',
      options: ['Một người nhanh tay gắp bỏ vào miệng người kia', 'Chia đôi miếng ăn một cách công bằng tuyệt đối', 'Một người giả vờ nhường nhưng ánh mắt đầy luyến tiếc', 'Dùng trò oẳn tù tì để phân định thắng thua']
    }
  ],

  deep_soul: [
    {
      text: 'Khi bạn rơi vào bế tắc và mệt mỏi nhất, điều gì từ người ấy giúp bạn hồi phục?',
      options: ['Một cái ôm im lặng không cần hỏi han nhiều', 'Sự kiên nhẫn lắng nghe toàn bộ tâm sự của bạn', 'Lời khẳng định: "Dù thế nào anh/em vẫn luôn ở đây"', 'Cùng bạn đi dạo và giúp bạn tạm quên áp lực']
    },
    {
      text: 'Ngôn ngữ tình yêu chính của bạn (điều khiến bạn cảm thấy được yêu nhất)?',
      options: ['Lời khen ngợi và động viên chân thành (Words of Affirmation)', 'Thời gian chất lượng bên nhau không phân tâm (Quality Time)', 'Những món quà bất ngờ mang nhiều tâm huyết (Receiving Gifts)', 'Sự chăm sóc chu đáo trong từng việc nhỏ (Acts of Service)']
    },
    {
      text: 'Nỗi sợ lớn nhất của bạn trong mối quan hệ tình cảm là gì?',
      options: ['Sự im lặng và xa cách dần theo thời gian', 'Làm tổn thương người mình yêu thương nhất', 'Không đủ tốt để đem lại hạnh phúc cho người kia', 'Mất đi sự thấu hiểu và kết nối tâm hồn']
    },
    {
      text: 'Điều gì ở người ấy khiến bạn cảm thấy mình được chấp nhận trọn vẹn?',
      options: ['Bạn có thể bộc lộ điểm yếu mà không sợ bị phán xét', 'Người ấy yêu cả những thói quen kỳ quặc của bạn', 'Người ấy kiên nhẫn khi bạn đang có tâm trạng tồi tệ', 'Bạn được là chính mình chân thật nhất khi ở cạnh']
    },
    {
      text: 'Khi hai bạn có bất đồng sâu sắc, cách bạn thường xử lý cảm xúc là gì?',
      options: ['Cần một khoảng lặng một mình để bình tĩnh suy nghĩ', 'Muốn nói chuyện thẳng thắn rõ ràng ngay lập tức', 'Cần được ôm hoặc nắm tay trước khi nói chuyện', 'Viết ra những suy nghĩ của mình để người kia đọc']
    },
    {
      text: 'Khoảnh khắc nào bạn cảm nhận tình yêu của hai bạn đã trưởng thành hơn?',
      options: ['Khi cả hai cùng vượt qua một biến cố khó khăn', 'Khi biết đặt mình vào vị trí của người kia để thấu hiểu', 'Khi học được cách nhường nhịn cái tôi vì nhau', 'Khi cùng nhau lập kế hoạch nghiêm túc cho tương lai']
    },
    {
      text: 'Điều gì bạn thầm biết ơn người ấy nhất kể từ ngày yêu nhau?',
      options: ['Giúp bạn trở thành một phiên bản tốt đẹp và tích cực hơn', 'Luôn tin tưởng vào ước mơ và năng lực của bạn', 'Đem lại cho bạn cảm giác an toàn mà trước đây chưa từng có', 'Dạy cho bạn cách yêu thương và trân trọng bản thân']
    },
    {
      text: 'Nếu chỉ được nói một câu nhắn nhủ với đối phương ở thì tương lai 20 năm sau, bạn sẽ nói gì?',
      options: ['"Cảm ơn vì đã cùng anh/em đi qua ngần ấy năm tháng"', '"Tình yêu của anh/em dành cho em/anh vẫn vẹn nguyên như ngày đầu"', '"Chúng ta đã làm rất tốt, phải không em/anh?"', '"Nụ cười của em/anh vẫn là điều đẹp nhất đời anh/em"']
    },
    {
      text: 'Điều gì khiến bạn tin rằng hai bạn là định mệnh của nhau?',
      options: ['Sự đồng điệu kỳ lạ trong những suy nghĩ không lời', 'Những trùng hợp bất ngờ từ trước khi quen biết', 'Cảm giác thân quen như đã biết nhau từ kiếp trước', 'Sự bình yên sâu lắng mỗi khi ở cạnh nhau']
    },
    {
      text: 'Khi bạn thấy người ấy khóc, cảm xúc trong lòng bạn lúc đó là gì?',
      options: ['Xót xa tột cùng và chỉ muốn chịu đựng thay người ấy', 'Tự trách mình vì chưa bảo vệ người ấy tốt hơn', 'Muốn ôm chặt và lau khô từng giọt nước mắt', 'Lắng nghe trong im lặng để người ấy trút hết muộn phiền']
    },
    {
      text: 'Nét tính cách nào của người ấy bù đắp hoàn hảo nhất cho khuyết điểm của bạn?',
      options: ['Sự điềm tĩnh của người ấy cân bằng sự nóng nảy của bạn', 'Sự lạc quan của người ấy xua tan âu lo của bạn', 'Sự quyết đoán của người ấy giúp bạn bớt do dự', 'Sự ấm áp dịu dàng của người ấy làm mềm sự bướng bỉnh']
    },
    {
      text: 'Đối với bạn, định nghĩa về một "tình yêu bền vững" là gì?',
      options: ['Là cùng nhau vượt qua giông bão mà không buông tay', 'Là sự tha thứ, bao dung và chấp nhận khuyết điểm của nhau', 'Là mỗi ngày đều chọn yêu đối phương một lần nữa', 'Là giữ được sự tôn trọng và tiếng cười qua năm tháng']
    }
  ]
};

/**
 * Lấy danh sách câu hỏi theo chủ đề, ưu tiên các câu chưa xuất hiện trong danh sách đã chơi gần đây.
 */
export function getTopicQuestions(topicId = 'romance', count = 5, excludeTexts = []) {
  const pool = QUESTION_POOL[topicId] || QUESTION_POOL.romance;
  const excludeSet = new Set((excludeTexts || []).map(t => String(t).trim()));

  const unseen = pool.filter(q => !excludeSet.has(q.text.trim()));
  const seen = pool.filter(q => excludeSet.has(q.text.trim()));

  // Trộn danh sách ngẫu nhiên
  const shuffledUnseen = [...unseen].sort(() => Math.random() - 0.5);
  const shuffledSeen = [...seen].sort(() => Math.random() - 0.5);

  const selected = [...shuffledUnseen, ...shuffledSeen].slice(0, count);

  return selected.map((q, idx) => ({
    id: idx + 1,
    text: q.text,
    options: [...q.options],
    image_path: null
  }));
}

/**
 * Đổi 1 câu hỏi ngẫu nhiên trong chủ đề mà không trùng với các câu đang có trên màn hình.
 */
export function getRandomReplacement(topicId = 'romance', currentTexts = []) {
  const pool = QUESTION_POOL[topicId] || QUESTION_POOL.romance;
  const currentSet = new Set((currentTexts || []).map(t => String(t).trim()));

  const candidates = pool.filter(q => !currentSet.has(q.text.trim()));
  const list = candidates.length > 0 ? candidates : pool;
  const picked = list[Math.floor(Math.random() * list.length)];

  return {
    text: picked.text,
    options: [...picked.options],
    image_path: null
  };
}

/**
 * Sinh lời bình luận "Mảnh ghép bù trừ" & gợi ý mở đầu câu chuyện cho các câu trả lời khác nhau (mismatch).
 * Biến sự khác biệt thành lý do để hai người trò chuyện, thấu hiểu và gắn kết nhau hơn!
 */
export function getComplementaryInsight(questionText = '', ownerAnswer = '', partnerAnswer = '', ownerName = 'Bạn', partnerName = 'Người ấy') {
  const q = String(questionText).toLowerCase();

  if (q.includes('món ăn') || q.includes('ăn gì') || q.includes('bữa tối')) {
    return {
      title: 'Mảnh ghép vị giác phong phú',
      badge: 'Bù trừ ngọt ngào 🍜',
      advice: `${ownerName} thích "${ownerAnswer}" còn ${partnerName} chọn "${partnerAnswer}". Hai gu ẩm thực phong phú nghĩa là lần hẹn hò tới, cả hai sẽ có lý do gọi gấp đôi món ngon để cùng chia sẻ cho nhau nếm thử!`
    };
  }

  if (q.includes('cuối tuần') || q.includes('buổi sáng') || q.includes('chiều chủ nhật')) {
    return {
      title: 'Sự cân bằng hoàn hảo',
      badge: 'Hai nửa nhịp sống ⏳',
      advice: `Một người thích "${ownerAnswer}", một người hướng về "${partnerAnswer}". Cuối tuần này, hãy thử dành nửa ngày cho sở thích của người này và nửa ngày còn lại chiều theo người kia nhé!`
    };
  }

  if (q.includes('ngôi nhà') || q.includes('phòng') || q.includes('không gian') || q.includes('tổ ấm')) {
    return {
      title: 'Tổ ấm đa sắc màu',
      badge: 'Mảnh ghép tương lai 🏡',
      advice: `Tổ ấm sẽ càng thêm ấm cúng khi kết hợp cả góc "${ownerAnswer}" của ${ownerName} lẫn không gian "${partnerAnswer}" của ${partnerName}. Một ngôi nhà chứa đựng trọn vẹn cá tính của cả hai!`
    };
  }

  if (q.includes('giận') || q.includes('làm hòa') || q.includes('tranh cãi') || q.includes('bất đồng')) {
    return {
      title: 'Hiểu để thương nhiều hơn',
      badge: 'Chìa khóa vỗ về 🔑',
      advice: `${ownerName} cảm thấy ấm lòng với "${ownerAnswer}", trong khi ${partnerName} lại dễ mở lòng hơn khi "${partnerAnswer}". Giờ thì cả hai đã có sẵn "cẩm nang vỗ về" bí mật của đối phương rồi đấy!`
    };
  }

  if (q.includes('lạc đường') || q.includes('mua sắm') || q.includes('trúng số') || q.includes('hài hước')) {
    return {
      title: 'Bộ đôi siêu quậy',
      badge: 'Gia vị tiếng cười 🎭',
      advice: `Cách phản ứng khác biệt này chính là công thức tạo nên những trận cười sảng khoái mỗi khi hai bạn ở cạnh nhau. Hãy chia sẻ xem tại sao lúc đó bạn lại chọn như vậy nhé!`
    };
  }

  if (q.includes('mệt mỏi') || q.includes('yêu nhất') || q.includes('ngôn ngữ tình yêu') || q.includes('tâm hồn')) {
    return {
      title: 'Góc nhìn sâu lắng',
      badge: 'Thấu hiểu tâm tư 🌙',
      advice: `Mỗi người đều có một cách riêng để cảm nhận tình yêu. Sự khác biệt giữa "${ownerAnswer}" và "${partnerAnswer}" là chiếc cầu nối tuyệt vời để hai bạn mở rộng trái tim lắng nghe nhau tối nay.`
    };
  }

  // Fallback insight
  return {
    title: 'Mảnh ghép bù trừ độc đáo',
    badge: 'Điểm chạm mới lạ ✨',
    advice: `Chính sự khác biệt giữa "${ownerAnswer}" và "${partnerAnswer}" làm nên sức hút đặc biệt của hai bạn. Thế giới sẽ thật buồn tẻ nếu ai cũng giống hệt nhau — hãy hỏi nhau lý do đằng sau lựa chọn này nhé!`
  };
}

const playedHistory = new Map();

export function recordPlayedQuestions(tagUid = 'default', questionTexts = []) {
  const key = tagUid || 'default';
  if (!playedHistory.has(key)) {
    playedHistory.set(key, new Set());
  }
  const set = playedHistory.get(key);
  for (const text of questionTexts) {
    if (text) set.add(String(text).trim());
  }
}

export function getPlayedQuestions(tagUid = 'default') {
  const key = tagUid || 'default';
  return Array.from(playedHistory.get(key) || []);
}

