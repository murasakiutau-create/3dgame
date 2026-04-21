extends Node

const CATALOG_PATH := "res://data/catalog.json"

var items: Array = []
var _by_id: Dictionary = {}

func _ready() -> void:
	_load()

func _load() -> void:
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		push_error("Catalog missing: %s" % CATALOG_PATH)
		return
	var text := file.get_as_text()
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_ARRAY:
		push_error("Catalog JSON malformed.")
		return
	items = parsed
	_by_id.clear()
	for entry in items:
		_by_id[entry["id"]] = entry

func get_item(id: String) -> Dictionary:
	return _by_id.get(id, {})

func get_size(id: String) -> Vector2i:
	var entry: Dictionary = _by_id.get(id, {})
	var arr: Array = entry.get("size", [1, 1])
	return Vector2i(int(arr[0]), int(arr[1]))

func get_scene_path(id: String) -> String:
	var entry: Dictionary = _by_id.get(id, {})
	return entry.get("scene", "")

func get_display_name(id: String) -> String:
	var entry: Dictionary = _by_id.get(id, {})
	return entry.get("name", id)

## Returns the layer a furniture belongs to: "floor" (default), "rug".
func get_layer(id: String) -> String:
	var entry: Dictionary = _by_id.get(id, {})
	return entry.get("layer", "floor")

## Returns the height (in meters) where 1x1 items can be placed on top of
## this furniture. 0 means no top surface.
func get_top_surface_height(id: String) -> float:
	var entry: Dictionary = _by_id.get(id, {})
	return float(entry.get("top_surface_height", 0.0))

func get_category(id: String) -> String:
	var entry: Dictionary = _by_id.get(id, {})
	return entry.get("category", "")
