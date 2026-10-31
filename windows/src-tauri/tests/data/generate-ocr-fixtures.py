"""Reproduce the independent public OCR corpus using Pillow + NumPy."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

here = Path(__file__).resolve().parent
font = ImageFont.truetype(str(here.parents[2] / 'src/workspace/assets/AtkinsonHyperlegible-Regular.ttf'), 38)
image = Image.new('RGB', (1200, 700), 'white')
draw = ImageDraw.Draw(image)
for y, text in [(70, 'Reading notes stay on this computer.'),
                (170, 'Le jardin contient trente roses.'),
                (270, 'El libro tiene cinco cartas.'),
                (610, 'Footnote: page 42.')]:
    draw.text((65, y), text, font=font, fill=(20, 20, 20))
image.save(here / 'ocr-native-small.png')
skewed = image.rotate(1.5, resample=Image.Resampling.BICUBIC, expand=False, fillcolor='white')
pixels = np.array(skewed, dtype=np.int16)
noise = np.random.default_rng(20261019).integers(-7, 8, pixels.shape, dtype=np.int16)
Image.fromarray(np.clip(pixels + noise, 0, 255).astype(np.uint8)).save(here / 'ocr-noisy-skew.jpg', quality=58)
