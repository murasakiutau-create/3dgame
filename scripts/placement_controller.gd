extends Node3D
class_name PlacementController

signal item_placed(id: String, node: Node3D)
signal item_removed(id: String)
signal inventory_changed()

enum State { IDLE, PLACING }

const RUG_Y: float = 0.02
const ON_RUG_Y: float = 0.05
const STACKED_META := "stacked_on_cell"

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
var _edit_original_stacked_cell: Variant = null
var _is_snap: bool = true
var _view_mode: bool = false
var _focused_id: String = ""

func get_focused_id() -> String:
	return _focused_id

## Called by UI to switch between build mode (default) and view/zoom mode.
func set_view_mode(active: bool) -> void:
	if _view_mode == active:
		return
	_view_mode = active
	if active:
		_cancel_ghost()
	else:
		_focused_id = ""
		_camera.reset_view()

func is_view_mode() -> bool:
	return _view_mode

func _try_focus_on_clicked() -> void:
	var t: Node3D = _find_item_under_mouse()
	if t == null:
		_focused_id = ""
		_camera.reset_view()
		return
	_focused_id = str(t.get_meta("furniture_id", ""))
	_camera.focus_on(t)

func _find_item_under_mouse() -> Node3D:
	var mouse: Vector2 = get_viewport().get_mouse_position()
	var world: Vector3 = _camera.mouse_to_ground(mouse)
	var clicked_cell: Vector2i = _grid.world_to_cell(world)
	var target: Node3D = null
	var best_priority: int = -1
	var best_dist: float = INF
	for child in _items_parent.get_children():
		if not (child is Node3D):
			continue
		var cid: String = str(child.get_meta("furniture_id", ""))
		if cid == "":
			continue
		var csize: Vector2i = Catalog.get_size(cid)
		var crot: int = int(fposmod(int(round(child.rotation_degrees.y)), 360))
		var cw: int = csize.x
		var ch: int = csize.y
		if posmod(crot, 180) == 90:
			cw = csize.y
			ch = csize.x
		var cbase: Vector2i
		if child.has_meta(STACKED_META):
			cbase = child.get_meta(STACKED_META)
		else:
			cbase = Vector2i(
				int(round(child.position.x - cw * 0.5)),
				int(round(child.position.z - ch * 0.5))
			)
		if clicked_cell.x < cbase.x or clicked_cell.x >= cbase.x + cw:
			continue
		if clicked_cell.y < cbase.y or clicked_cell.y >= cbase.y + ch:
			continue
		var priority: int = 2
		if child.has_meta(STACKED_META):
			priority = 3
		elif Catalog.get_layer(cid) == "rug":
			priority = 1
		var dist: float = Vector2(child.position.x - world.x, child.position.z - world.z).length()
		if priority > best_priority or (priority == best_priority and dist < best_dist):
			best_priority = priority
			best_dist = dist
			target = child
	return target

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
	_edit_original_stacked_cell = null
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
	# Apply layer-specific Y and placement rules.
	var layer: String = Catalog.get_layer(_ghost_id)
	var ok: bool = false
	if layer == "rug":
		_ghost.position.y = RUG_Y
		ok = true
	else:
		var can_floor: bool = _grid.can_place(base_cell, _ghost_size, _ghost_rot_deg, _ghost)
		if can_floor:
			_ghost.position.y = ON_RUG_Y if _grid.has_rug_in_area(base_cell, _ghost_size, _ghost_rot_deg) else 0.0
			ok = true
		elif _is_1x1() and _grid.stack_height_at(base_cell, _ghost) > 0.0:
			_ghost.position.y = _grid.stack_height_at(base_cell, _ghost)
			ok = true
		else:
			_ghost.position.y = 0.0
			ok = not _is_snap
	_update_ghost_tint(ok)

func _is_1x1() -> bool:
	return _ghost_size.x == 1 and _ghost_size.y == 1

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
		elif event.is_action_pressed("rotate_north"):
			_ghost_rot_deg = 0
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("rotate_east"):
			_ghost_rot_deg = 90
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("rotate_south"):
			_ghost_rot_deg = 180
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("rotate_west"):
			_ghost_rot_deg = 270
			get_viewport().set_input_as_handled()
		elif event.is_action_pressed("place_delete"):
			_delete_ghost()
			get_viewport().set_input_as_handled()
	else:
		if _view_mode:
			if event.is_action_pressed("place_confirm"):
				_try_focus_on_clicked()
			elif event.is_action_pressed("place_cancel"):
				_camera.reset_view()
		else:
			if event.is_action_pressed("place_confirm"):
				_try_start_edit()

func _confirm() -> void:
	if _ghost == null:
		return
	var base_cell: Vector2i = _cell_from_ghost_position()
	var layer: String = Catalog.get_layer(_ghost_id)
	var placed_ok: bool = false
	var stacked_cell: Variant = null

	if layer == "rug":
		# Rugs don't occupy the floor grid but are tracked so other
		# furniture placed above can be lifted clear of the rug.
		_grid.place_rug(_ghost, base_cell, _ghost_size, _ghost_rot_deg)
		placed_ok = true
	elif _grid.can_place(base_cell, _ghost_size, _ghost_rot_deg, _ghost):
		_grid.place(_ghost, base_cell, _ghost_size, _ghost_rot_deg)
		placed_ok = true
	elif _is_1x1() and _grid.stack_height_at(base_cell, _ghost) > 0.0:
		_grid.place_on_top(_ghost, base_cell)
		stacked_cell = base_cell
		placed_ok = true

	if not placed_ok:
		return

	if stacked_cell != null:
		_ghost.set_meta(STACKED_META, stacked_cell)
	else:
		if _ghost.has_meta(STACKED_META):
			_ghost.remove_meta(STACKED_META)

	_apply_ghost_material(_ghost, false)
	var placed: Node3D = _ghost
	var id: String = _ghost_id
	_ghost = null
	_ghost_id = ""
	_editing_existing = false
	_edit_original_stacked_cell = null
	_state = State.IDLE
	item_placed.emit(id, placed)
	inventory_changed.emit()

func _cancel_ghost() -> void:
	if _ghost == null:
		_state = State.IDLE
		return
	if _editing_existing:
		var layer: String = Catalog.get_layer(_ghost_id)
		if layer == "rug":
			_ghost.position = _grid.cell_to_world_center(_edit_original_cell, _ghost_size, _edit_original_rot)
			_ghost.position.y = RUG_Y
			_ghost.rotation_degrees.y = float(_edit_original_rot)
			_grid.place_rug(_ghost, _edit_original_cell, _ghost_size, _edit_original_rot)
		elif _edit_original_stacked_cell != null:
			var c: Vector2i = _edit_original_stacked_cell
			_ghost.position = _grid.cell_to_world_center(c, _ghost_size, _edit_original_rot)
			_ghost.position.y = _grid.stack_height_at(c, _ghost)
			_ghost.rotation_degrees.y = float(_edit_original_rot)
			_grid.place_on_top(_ghost, c)
			_ghost.set_meta(STACKED_META, c)
		else:
			_ghost.position = _grid.cell_to_world_center(_edit_original_cell, _ghost_size, _edit_original_rot)
			_ghost.position.y = ON_RUG_Y if _grid.has_rug_in_area(_edit_original_cell, _ghost_size, _edit_original_rot) else 0.0
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
	_edit_original_stacked_cell = null
	_state = State.IDLE

func _delete_ghost() -> void:
	if _ghost == null:
		return
	var id: String = _ghost_id
	var n: Node3D = _ghost
	_ghost = null
	_ghost_id = ""
	_editing_existing = false
	_edit_original_stacked_cell = null
	_state = State.IDLE
	if n.get_parent() != null:
		n.get_parent().remove_child(n)
	n.queue_free()
	item_removed.emit(id)
	inventory_changed.emit()

func _try_start_edit() -> void:
	var mouse: Vector2 = get_viewport().get_mouse_position()
	var cam: Camera3D = _camera.camera
	var ray_from: Vector3 = cam.project_ray_origin(mouse)
	var ray_dir: Vector3 = cam.project_ray_normal(mouse)
	var target: Node3D = null
	var best_priority: int = -1
	var best_t: float = INF
	for child in _items_parent.get_children():
		if not (child is Node3D):
			continue
		var cid: String = str(child.get_meta("furniture_id", ""))
		if cid == "":
			continue
		var aabb: AABB = _world_aabb(child)
		if aabb.size == Vector3.ZERO:
			continue
		# Expand a tiny bit so very thin rugs still receive the ray.
		aabb = aabb.grow(0.02)
		var hit: Variant = aabb.intersects_ray(ray_from, ray_dir)
		if hit == null:
			continue
		var t: float = (hit - ray_from).length()
		var priority: int = 2
		if child.has_meta(STACKED_META):
			priority = 3
		elif Catalog.get_layer(cid) == "rug":
			priority = 1
		if priority > best_priority or (priority == best_priority and t < best_t):
			best_priority = priority
			best_t = t
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
	var layer: String = Catalog.get_layer(id)
	if target.has_meta(STACKED_META):
		_edit_original_stacked_cell = target.get_meta(STACKED_META)
		_grid.release_top(target)
	else:
		_edit_original_stacked_cell = null
		if layer == "rug":
			_grid.release_rug(target)
		else:
			_grid.release(target)
	_ghost = target
	_ghost_id = id
	_ghost_size = size
	_ghost_rot_deg = rot
	_editing_existing = true
	_apply_ghost_material(_ghost, true)
	_state = State.PLACING

## Returns the world-space AABB covering every MeshInstance3D under `root`.
func _world_aabb(root: Node) -> AABB:
	var out: AABB = AABB()
	var first: bool = true
	var stack: Array = [root]
	while not stack.is_empty():
		var n = stack.pop_back()
		for c in n.get_children():
			stack.append(c)
		if n is MeshInstance3D:
			var mesh: Mesh = n.mesh
			if mesh == null:
				continue
			var local: AABB = mesh.get_aabb()
			var world: AABB = n.global_transform * local
			if first:
				out = world
				first = false
			else:
				out = out.merge(world)
	return out

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
	var layer: String = Catalog.get_layer(item_id)
	if layer == "rug":
		n.position.y = RUG_Y
		_grid.place_rug(n, base_cell, size, rot_deg)
	elif _grid.can_place(base_cell, size, rot_deg, n):
		_grid.place(n, base_cell, size, rot_deg)
		n.position.y = ON_RUG_Y if _grid.has_rug_in_area(base_cell, size, rot_deg) else 0.0
	elif size.x == 1 and size.y == 1 and _grid.stack_height_at(base_cell, n) > 0.0:
		var h: float = _grid.stack_height_at(base_cell, n)
		_grid.place_on_top(n, base_cell)
		n.position.y = h
		n.set_meta(STACKED_META, base_cell)
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
