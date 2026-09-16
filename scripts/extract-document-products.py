"""Extract the supplied product brief; copy original embedded images without editing."""
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from lxml import etree

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
categories = ['Dây chuyền', 'Nhẫn', 'Vòng tay', 'Vòng tay', 'Dây chuyền', 'Nhẫn', 'Vòng tay', 'Dây chuyền']
with ZipFile(source) as archive:
    rels = {r.get('Id'): r.get('Target') for r in etree.fromstring(archive.read('word/_rels/document.xml.rels'))}
    body = etree.fromstring(archive.read('word/document.xml'))
    sections, current, last_image = [], None, None
    for el in body.xpath('//w:body/*', namespaces=ns):
        text = ''.join(el.xpath('.//w:t/text()', namespaces=ns)).strip()
        for rid in el.xpath('.//a:blip/@r:embed', namespaces=ns):
            last_image = 'word/' + rels[rid]
        if text.startswith('Tên sản phẩm:'):
            current = {'name': text.split(':', 1)[1].strip(), 'image': last_image, 'lines': [], 'specs': []}
            sections.append(current)
        elif current and el.tag.endswith('}tbl'):
            for row in el.xpath('./w:tr', namespaces=ns)[1:]:
                current['specs'].append([' '.join(c.xpath('.//w:t/text()', namespaces=ns)).strip() for c in row.xpath('./w:tc', namespaces=ns)])
        elif current and text:
            current['lines'].append(text)
    assert len(sections) == 8, 'Expected eight products in the supplied brief'
    products = []
    for index, section in enumerate(sections):
        lines = section['lines']
        slug = 'emoria-' + section['name'].split()[1].lower()
        price = int(re.search(r'([\d.]+)\s*VNĐ', lines[0]).group(1).replace('.', ''))
        combo_line = next((s for s in lines if s.startswith('Combo')), None)
        combo = int(re.search(r'([\d.]+)\s*VNĐ', combo_line).group(1).replace('.', '')) if combo_line else None
        first = lines.index('Quyền lợi đi kèm:') + 1
        last = lines.index('Mô tả sản phẩm')
        headline = lines[last+1]
        image = f'/assets/catalog/{slug}.png'
        target = root / 'public' / image.lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(section['image']))
        product = dict(id=slug, name=section['name'], category=categories[index], material='Bạc S925',
                       price=price, image=image, hasNFC=True, isNfcFeatured=slug=='emoria-lumen',
                       subtitle=headline, description=f'{section["name"]} thuộc dòng {categories[index].lower()} bạc S925 tích hợp NFC. Chạm bằng điện thoại hỗ trợ NFC để mở Memory Space với video, ảnh, giọng nói và thư riêng.',
                       benefits=lines[first:last], specifications=section['specs'], unitsPerItem=1,
                       sourceRevision='dig-mar-group2-20260916', priceNote='Giá dự kiến theo bộ sưu tập',
                       sizes=['Tiêu chuẩn'])
        products.append(product)
        if combo:
            products.append({**product, 'id': slug+'-duo', 'name': section['name']+' — Combo 2 chiếc',
                             'price': combo, 'unitsPerItem': 2, 'isNfcFeatured': False, 'tag': 'Combo cặp đôi',
                             'parentId': slug, 'benefits': ['02 chiếc cùng mẫu, mỗi chiếc có một không gian kỷ niệm NFC riêng.', *lines[first+1:last]],
                             'description': f'Combo 2 chiếc {section["name"]} cho cặp đôi. Mỗi chiếc có một chip NFC riêng để lưu giữ kỷ niệm.',
                             'sizes': ['Bộ 2 chiếc']})
    (root / 'src/data/document-products.json').write_text(json.dumps(products, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Extracted {len(sections)} models, {len(products)-len(sections)} combos and original product images.')
