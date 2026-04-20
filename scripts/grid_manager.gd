extends Node3D
class_name GridManager

const CELL_SIZE: float = 1.0

@export var grid_size: Vector2i = Vector2i(10, 10)

var _occupied: Dictionary = {}

func world_to_cell(world_pos: Vector3) -> Vector2i:
	return Vector2i(int(floor(world_pos.x / CELL_SIZE)), int(floor(world_pos.z / CELL_SIZE)))

func cell_to_world_corner(cell: Vector2i) -> Vector3:
	return Vector3(cell.x * CELL_SIZE, 0.0, cell.y * CELL_SIZE)

func cell_to_world_center(cell: Vector2i, size: Vector2i, rot_deg: int) -> Vector3:
	var w := size.x
	var h := size.y
	if posmod(int(rot_deg), 180) == 90:
		w = size.y
		h = size.x
	return Vector3(
		(cell.x + w * 0.5) * CELL_SIZE,
		0.0,
		(cell.y + h * 0.5) * CELL_SIZE
	)

func is_cell_in_bounds(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.x < grid_size.x and cell.y >= 0 and cell.y < grid_size.y

func cells_for_item(base_cell: Vector2i, size: Vector2i, rot_deg: int) -> Array:
	var w := size.x
	var h := size.y
	if posmod(int(rot_deg), 180) == 90:
		w = size.y
		h = size.x
	var cells: Array = []
	for y in range(h):
		for x in range(w):
			cells.append(base_cell + Vector2i(x, y))
	return cells

func can_place(base_cell: Vector2i, size: Vector2i, rot_deg: int, ignore: Node = null) -> bool:
	for cell in cells_for_item(base_cell, size, rot_deg):
		if not is_cell_in_bounds(cell):
			return false
		if _occupied.has(cell) and _occupied[cell] != ignore:
			return false
	return true

func place(item: Node, base_cell: Vector2i, size: Vector2i, rot_deg: int) -> void:
	for cell in cells_for_item(base_cell, size, rot_deg):
		_occupied[cell] = item

func release(item: Node) -> void:
	var to_remove: Array = []
	for cell in _occupied.keys():
		if _occupied[cell] == item:
			to_remove.append(cell)
	for cell in to_remove:
		_occupied.erase(cell)

func clear_all() -> void:
	_occupied.clear()

func bounds_world_size() -> Vector3:
	return Vector3(grid_size.x * CELL_SIZE, 0.0, grid_size.y * CELL_SIZE)

func clamp_to_bounds(world_pos: Vector3) -> Vector3:
	var max_x := grid_size.x * CELL_SIZE
	var max_z := grid_size.y * CELL_SIZE
	return Vector3(
		clamp(world_pos.x, 0.0, max_x),
		world_pos.y,
		clamp(world_pos.z, 0.0, max_z)
	)
