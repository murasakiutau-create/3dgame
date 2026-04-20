extends Node

const SAVE_PATH := "user://layout.json"
const SAVE_VERSION := 1

func save_layout(placement: PlacementController) -> bool:
	var data: Dictionary = {
		"version": SAVE_VERSION,
		"items": placement.get_placed_snapshot()
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_error("Cannot open %s for write." % SAVE_PATH)
		return false
	f.store_string(JSON.stringify(data, "\t"))
	return true

func load_layout(placement: PlacementController) -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return false
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	placement.clear_all()
	var items: Array = parsed.get("items", [])
	for entry in items:
		var id: String = entry.get("id", "")
		var cell_arr: Array = entry.get("cell", [0, 0])
		var rot: int = int(entry.get("rot", 0))
		placement.spawn_placed(id, Vector2i(int(cell_arr[0]), int(cell_arr[1])), rot)
	return true

func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)
