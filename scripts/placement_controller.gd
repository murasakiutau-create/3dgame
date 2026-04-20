extends Node3D
class_name PlacementController

signal item_placed(id: String, node: Node3D)
signal item_removed(id: String)
signal inventory_changed()

enum State { IDLE, PLACING }

@export var items_parent_path: NodePath = NodePath("Items")
@export var camera_path: NodePath
@export var grid_manager_path: NodePath

@onready var _items_parent: Node3D = get_node(items_parent_path)
@onready var _camera: CameraIso = get_node(camera_path)
@onready var _grid: GridManager = get_node(grid_manager_path)

var _state: int = State.IDLE
var _ghost: Node3D = null
var _ghost_id: String = ""
var _ghost_size: Vector2i = Vector2i.ONE
var _ghost_rot_deg: int = 0
var _editing_existing: bool = false
var _edit_original_cell: Vector2i = Vector2i.ZERO
var _edit_original_rot: int = 0
var _is_snap: bool = true

## Start placing a brand-new furniture picked from the catalog.
func start_placement(item_id: String) -> void:
	_cancel_ghost()
	var scene_path: String = Catalog.get_scene_path(item_id)
	if scene_path == "":
		return
	var ps: PackedScene = load(scene_path)
	if ps == null:
		return
	var inst: Node3D = ps.instantiate()
	inst.set_meta("furniture_id", item_id)
	_items_parent.add_child(inst)
	_ghost = inst
	_ghost_id = item_id
	_ghost_size = Catalog.get_size(item_id)
	_ghost_rot_deg = 0
	_editing_existing = false
	_apply_ghost_material(_ghost, true)
	_state = State.PLACING

func _process(_delta: float) -> void:
	if _state != State.PLACING or _ghost == null:
		return
	var mouse: Vector2 = get_viewport().get_mouse_position()
	var world: Vector3 = _camera.mouse_to_ground(mouse)
	_is_snap = not Input.is_action_pressed("snap_free")
	var base_cell: Vector2i
	if _is_snap:
		base_cell = _grid.world_to_cell(world)
		base_cell.x = clamp(base_cell.x, 0, _grid.grid_size.x - 1)
		base_cell.y = clamp(base_cell.y, 0, _grid.grid_size.y - 1)
		_ghost.position = _grid.cell_to_world_center(base_cell, _ghost_size, _ghost_rot_deg)
	else:
		var clamped: Vector3 = _grid.clamp_to_bounds(Vector3(world.x, 0.0, world.z))
		_ghost.position = clamped
		base_cell = _grid.world_to_cell(clamped)
	_ghost.rotation_degrees.y = float(_ghost_rot_deg)
	var ok: bool = not _is_snap or _grid.can_place(base_cell, _ghost_size, _ghost_rot_deg, _ghost)
	_update_ghost_tint(ok)

func _unhandled_input(event: InputEvent) -> void:
	if _state == State.PLACING:
		if event.is_action_pressed("place_confirm"):
			_confirm()
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("place_cancel"):
			_cancel_ghost()
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("place_rotate"):
			var step: int = 15 if Input.is_key_pressed(KEY_SHIFT) else 90
			_ghost_rot_deg = int(fposmod(_ghost_rot_deg + step, 360))
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("place_delete"):
			_delete_ghost()
			get_viewport().set_input_as_handled()
	else:
		if event.is_action_pressed("place_confirm"):
			_try_start_edit()

func _confirm() -> void:
	if _ghost == null:
		return
	var base_cell: Vector2i = _cell_from_ghost_position()
	if _is_snap and not _grid.can_place(base_cell, _ghost_size, _ghost_rot_deg, _ghost):
		return
	if _is_snap:
		_grid.place(_ghost, base_cell, _ghost_size, _ghost_rot_deg)
	_apply_ghost_material(_ghost, false)
	var placed: Node3D = _ghost
	var id: String = _ghost_id
	_ghost = null
	_ghost_id = ""
	_editing_existing = false
	_state = State.IDLE
	item_placed.emit(id, placed)
	inventory_changed.emit()

func _cancel_ghost() -> void:
	if _ghost == null:
		_state = State.IDLE
		return
	if _editing_existing:
		_ghost.position = _grid.cell_to_world_center(_edit_original_cell, _ghost_size, _edit_original_rot)
		_ghost.rotation_degrees.y = float(_edit_original_rot)
		_grid.place(_ghost, _edit_original_cell, _ghost_size, _edit_original_rot)
		_apply_ghost_material(_ghost, false)
	else:
		if _ghost.get_parent() != null:
			_ghost.get_parent().remove_child(_ghost)
		_ghost.queue_free()
	_ghost = null
	_ghost_id = ""
	_editing_existing = false
	_state = State.IDLE

func _delete_ghost() -> void:
	if _ghost == null:
		return
	var id: String = _ghost_id
	var n: Node3D = _ghost
	_ghost = null
	_ghost_id = ""
	_editing_existing = false
	_state = State.IDLE
	if n.get_parent() != null:
		n.get_parent().remove_child(n)
	n.queue_free()
	item_removed.emit(id)
	inventory_changed.emit()

func _try_start_edit() -> void:
	var mouse: Vector2 = get_viewport().get_mouse_position()
	var world: Vector3 = _camera.mouse_to_ground(mouse)
	var target: Node3D = null
	var min_d: float = INF
	for child in _items_parent.get_children():
		if not (child is Node3D):
			continue
		var d: float = Vector2(child.position.x - world.x, child.position.z - world.z).length()
		if d < min_d and d < 1.5:
			min_d = d
			target = child
	if target == null:
		return
	var id: String = str(target.get_meta("furniture_id", ""))
	var size: Vector2i = Catalog.get_size(id)
	var rot: int = int(fposmod(int(round(target.rotation_degrees.y)), 360))
	var w: int = size.x
	var h: int = size.y
	if posmod(rot, 180) == 90:
		w = size.y
		h = size.x
	_edit_original_cell = Vector2i(
		int(round(target.position.x - w * 0.5)),
		int(round(target.position.z - h * 0.5))
	)
	_edit_original_rot = rot
	_grid.release(target)
	_ghost = target
	_ghost_id = id
	_ghost_size = size
	_ghost_rot_deg = rot
	_editing_existing = true
	_apply_ghost_material(_ghost, true)
	_state = State.PLACING

func _cell_from_ghost_position() -> Vector2i:
	var size: Vector2i = _ghost_size
	var rot: int = _ghost_rot_deg
	var w: int = size.x
	var h: int = size.y
	if posmod(rot, 180) == 90:
		w = size.y
		h = size.x
	return Vector2i(
		int(round(_ghost.position.x - w * 0.5)),
		int(round(_ghost.position.z - h * 0.5))
	)

func _apply_ghost_material(node: Node, as_ghost: bool) -> void:
	var stack: Array = [node]
	while not stack.is_empty():
		var n = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is MeshInstance3D:
			if as_ghost:
				var m := StandardMaterial3D.new()
				m.albedo_color = Color(0.5, 1.0, 0.7, 0.55)
				m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				n.material_override = m
			else:
				n.material_override = null

func _update_ghost_tint(ok: bool) -> void:
	var stack: Array = [_ghost]
	while not stack.is_empty():
		var n = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is MeshInstance3D and n.material_override is StandardMaterial3D:
			var sm: StandardMaterial3D = n.material_override
			sm.albedo_color = Color(0.5, 1.0, 0.7, 0.55) if ok else Color(1.0, 0.3, 0.3, 0.55)

## Spawn an item directly at a grid cell (used by save/load).
func spawn_placed(item_id: String, base_cell: Vector2i, rot_deg: int) -> Node3D:
	var scene_path: String = Catalog.get_scene_path(item_id)
	if scene_path == "":
		return null
	var ps: PackedScene = load(scene_path)
	if ps == null:
		return null
	var n: Node3D = ps.instantiate()
	n.set_meta("furniture_id", item_id)
	_items_parent.add_child(n)
	var size: Vector2i = Catalog.get_size(item_id)
	n.position = _grid.cell_to_world_center(base_cell, size, rot_deg)
	n.rotation_degrees.y = float(rot_deg)
	if _grid.can_place(base_cell, size, rot_deg, n):
		_grid.place(n, base_cell, size, rot_deg)
	item_placed.emit(item_id, n)
	inventory_changed.emit()
	return n

func get_placed_snapshot() -> Array:
	var snap: Array = []
	for child in _items_parent.get_children():
		if child == _ghost or not (child is Node3D):
			continue
		var id: String = str(child.get_meta("furniture_id", ""))
		if id == "":
			continue
		var size: Vector2i = Catalog.get_size(id)
		var rot: int = int(fposmod(int(round(child.rotation_degrees.y)), 360))
		var w: int = size.x
		var h: int = size.y
		if posmod(rot, 180) == 90:
			w = size.y
			h = size.x
		var base: Vector2i = Vector2i(
			int(round(child.position.x - w * 0.5)),
			int(round(child.position.z - h * 0.5))
		)
		snap.append({ "id": id, "cell": [base.x, base.y], "rot": rot })
	return snap

func count_placed_by_id() -> Dictionary:
	var counts: Dictionary = {}
	for child in _items_parent.get_children():
		if child == _ghost or not (child is Node3D):
			continue
		var id: String = str(child.get_meta("furniture_id", ""))
		if id == "":
			continue
		counts[id] = counts.get(id, 0) + 1
	return counts

func clear_all() -> void:
	_cancel_ghost()
	for child in _items_parent.get_children():
		_items_parent.remove_child(child)
		child.queue_free()
	_grid.clear_all()
	inventory_changed.emit()
