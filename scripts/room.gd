extends Node3D
class_name Room

@onready var grid_manager: GridManager = $GridManager
@onready var grid_lines: MeshInstance3D = $GridLines

func _ready() -> void:
	_build_grid_lines()

func _build_grid_lines() -> void:
	var size: Vector2i = grid_manager.grid_size
	var cell: float = GridManager.CELL_SIZE
	var y: float = 0.01

	var im := ImmediateMesh.new()
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mat.albedo_color = Color(0.55, 0.45, 0.55, 0.7)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA

	im.surface_begin(Mesh.PRIMITIVE_LINES, mat)
	for x in range(size.x + 1):
		im.surface_add_vertex(Vector3(x * cell, y, 0.0))
		im.surface_add_vertex(Vector3(x * cell, y, size.y * cell))
	for z in range(size.y + 1):
		im.surface_add_vertex(Vector3(0.0, y, z * cell))
		im.surface_add_vertex(Vector3(size.x * cell, y, z * cell))
	im.surface_end()
	grid_lines.mesh = im
