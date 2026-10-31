"""生成打包用的 app.ico（4 象限配色：三白一琥珀，代表“原始矢量 → 标准成果”）。"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 512
BACKGROUND = (24, 63, 53, 255)  # #183f35，与 index.html 的 theme-color 一致
WHITE = (255, 255, 255, 255)
AMBER = (255, 196, 87, 255)


def rounded(draw: ImageDraw.ImageDraw, box, radius: int, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def build() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    rounded(draw, (0, 0, SIZE - 1, SIZE - 1), 108, BACKGROUND)

    margin = 104
    gap = 26
    span = SIZE - margin * 2
    cell = (span - gap) // 2
    radius = 22
    origin_x, origin_y = margin, margin
    cells = [
        (0, 0, WHITE),
        (1, 0, AMBER),
        (0, 1, WHITE),
        (1, 1, WHITE),
    ]
    for col, row, color in cells:
        left = origin_x + col * (cell + gap)
        top = origin_y + row * (cell + gap)
        rounded(draw, (left, top, left + cell, top + cell), radius, color)
    return image


def main() -> int:
    output = Path(__file__).resolve().parent / "app.ico"
    icon = build()
    icon.save(
        output,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    preview = Path(__file__).resolve().parent / "_icon_preview.png"
    icon.resize((256, 256), Image.LANCZOS).save(preview)
    print(f"icon written: {output} ({output.stat().st_size} bytes), preview {preview}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
