from PIL import Image

im = Image.open('d:/toptop_duan/scripts/col0_mid.png')
w, h = im.size
im.crop((86, 0, 172, h)).save('d:/toptop_duan/scripts/mid_q1.png')
im.crop((172, 0, 258, h)).save('d:/toptop_duan/scripts/mid_q2.png')
im.crop((258, 0, 344, h)).save('d:/toptop_duan/scripts/mid_q3.png')
print("Saved mid_q1, mid_q2, mid_q3")
