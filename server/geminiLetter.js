const base = 'https://generativelanguage.googleapis.com';

const FALLBACK_TEMPLATES = {
  anniversary: {
    romantic: 'Gửi {recipient},\n\nNhìn lại chặng đường chúng ta đã cùng nhau đi qua, anh thấy mỗi ngày đều là một đặc ân quý giá. Chiếc trang sức này tựa như vầng sáng lưu giữ từng nụ cười, từng ánh mắt và những lời thì thầm dịu dàng nhất của đôi mình. Cảm ơn em vì đã luôn ở đây, đồng hành và làm cho cuộc đời anh trở nên trọn vẹn.\n\nYêu em nhiều hơn mỗi ngày,\n{author}',
    poetic: 'Gửi {recipient},\n\nThời gian có thể làm mờ phai nhiều điều, nhưng những khoảnh khắc bên em mãi là viên ngọc sáng lấp lánh trong tâm khảm. Kỷ vật này thay lời muốn nói, gửi gắm trọn vẹn tình yêu và lời hứa son sắt trọn đời bên nhau.\n\nMãi yêu em,\n{author}'
  },
  proposal: {
    romantic: 'Gửi {recipient},\n\nTừ giây phút đầu tiên nhìn vào đôi mắt em, anh đã biết trái tim mình thuộc về nơi đâu. Chiếc nhẫn này không chỉ là món quà trang sức, mà là chiếc chìa khóa mở ra tương lai nơi anh được che chở và yêu thương em suốt cuộc đời. Em đồng ý làm bạn đời của anh nhé?\n\nTrọn đời bên em,\n{author}'
  },
  birthday: {
    warm: 'Gửi {recipient},\n\nChúc mừng ngày sinh nhật của một người vô cùng đặc biệt! Chúc em luôn rạng rỡ, bình an và hạnh phúc bên những người thân yêu. Hy vọng kỷ vật này sẽ luôn nhắc nhở em rằng, em quý giá và được yêu thương biết bao nhiêu.\n\nThương mến,\n{author}'
  },
  gratitude: {
    sincere: 'Gửi {recipient},\n\nCó những công ơn và tình cảm ấm áp không thể diễn tả trọn vẹn bằng lời. Chiếc kỷ vật này gói trọn lòng biết ơn sâu sắc và sự kính trọng mà con luôn dành cho mẹ/cha. Cầu chúc người luôn an vui và khỏe mạnh.\n\nKính thương,\n{author}'
  }
};

function getFallbackLetter({ occasion = 'anniversary', tone = 'romantic', recipient = 'Người thương', author = 'Người gửi', memoryHint = '' }) {
  let template = FALLBACK_TEMPLATES[occasion]?.[tone] || FALLBACK_TEMPLATES.anniversary.romantic;
  let text = template.replace(/\{recipient\}/g, recipient).replace(/\{author\}/g, author);
  if (memoryHint) {
    text = text.replace(/(Cảm ơn em|Cầu chúc|Hy vọng)/, `Nhớ về ${memoryHint.trim()}, lòng anh lại đong đầy xúc cảm. $1`);
  }
  return text;
}

export async function craftLetter(c) {
  const {
    occasion = 'anniversary',
    tone = 'romantic',
    recipient = 'Người thương',
    author = 'Người gửi',
    memoryHint = '',
    language = 'vi'
  } = c.body || {};

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { letter: getFallbackLetter({ occasion, tone, recipient, author, memoryHint }) };
  }

  const model = process.env.GEMINI_LETTER_MODEL || process.env.GEMINI_VIDEO_MODEL || 'gemini-2.5-flash';
  const signal = AbortSignal.timeout(20000);

  const prompt = language === 'en'
    ? `You are an expert master poet and personal letter crafter for Emoria Luxury Jewelry.
Write a heartfelt, elegant, and deeply moving letter to accompany a fine jewelry keepsake gift.
- Occasion: ${occasion}
- Tone: ${tone}
- Recipient name: ${recipient}
- Author name: ${author}
- Personal memory/details: ${memoryHint || 'None specified'}
- Language: English. Length: 120-220 words.
Output only the finished letter with salutation and sign-off. No conversational filler or commentary.`
    : `Bạn là nhà văn và chuyên gia chắp bút thư tình cảm xúc cao cấp cho thương hiệu trang sức kim hoàn Emoria.
Hãy viết một lá thư tay sâu sắc, sang trọng, xúc động và chân thành để người tặng gửi gắm kèm theo chiếc trang sức kỷ vật.
- Dịp tặng: ${occasion}
- Tông giọng cảm xúc: ${tone}
- Người nhận: ${recipient}
- Người gửi: ${author}
- Kỷ niệm gợi ý: ${memoryHint || 'Tự do sáng tác chân thành'}
- Độ dài: Khoảng 120-220 từ. Văn phong tiếng Việt tinh tế, sang trọng, giàu hình ảnh và chạm đến trái tim.
Chỉ trả về toàn văn lá thư (gồm lời mở đầu và lời kết ký tên). Không thêm lời dẫn giải của AI.`;

  try {
    const response = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      })
    });

    if (!response.ok) {
      return { letter: getFallbackLetter({ occasion, tone, recipient, author, memoryHint }) };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const rawText = candidate?.content?.parts?.map(p => p.text || '').join('').trim();

    if (rawText && rawText.length > 20) {
      return { letter: rawText };
    }
    return { letter: getFallbackLetter({ occasion, tone, recipient, author, memoryHint }) };
  } catch {
    return { letter: getFallbackLetter({ occasion, tone, recipient, author, memoryHint }) };
  }
}
