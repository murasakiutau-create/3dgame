extends MeshInstance3D

## Paints a grid texture onto the floor so each 1m cell is visible.
## Uses a generated ImageTexture instead of ImmediateMesh lines, which
## was the trigger for the blank-viewport bug on ANGLE/Intel HD 520.

@export var cells: int = 7
@export var texture_size: int = 1024
@export var line_width: int = 2
@export var base_color: Color = Color(0.96, 0.93, 0.7, 1)
@export var line_color: Color = Color(0.82, 0.76, 0.7, 1)

func _ready() -> void:
	var tex: ImageTexture = _build_grid_texture()
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color.WHITE
	mat.albedo_texture = tex
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	set_surface_override_material(0, mat)

func _build_grid_texture() -> ImageTexture:
	var img := Image.create(texture_size, texture_size, false, Image.FORMAT_RGBA8)
	img.fill(base_color)
	var step: float = float(texture_size) / float(cells)
	for i in range(1, cells):
		var p: int = clampi(int(round(i * step)), 0, texture_size - 1)
		_draw_hline(img, p)
		_draw_vline(img, p)
	return ImageTexture.create_from_image(img)

func _draw_hline(img: Image, center_y: int) -> void:
	var half: int = line_width / 2
	for dy in range(-half, half + 1):
		var y: int = center_y + dy
		if y < 0 or y >= texture_size:
			continue
		for x in range(texture_size):
			img.set_pixel(x, y, line_color)

func _draw_vline(img: Image, center_x: int) -> void:
	var half: int = line_width / 2
	for dx in range(-half, half + 1):
		var x: int = center_x + dx
		if x < 0 or x >= texture_size:
			continue
		for y in range(texture_size):
			img.set_pixel(x, y, line_color)
