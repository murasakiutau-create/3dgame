extends Node

const SAVE_PATH := "user://inventory.json"

## Items the player starts with — used as defaults the first time the
## inventory is created. These are also the items whose `price` is 0 in
## catalog.json so the shop won't list them.
const STARTER_IDS: Array[String] = [
	"bed",
	"bookcase",
	"chair_white",
	"lamp_wood",
	"nightstand_wood",
]

signal inventory_changed()

var _owned: Dictionary = {}

func _ready() -> void:
	_load()

func is_owned(id: String) -> bool:
	return _owned.has(id)

func unlock(id: String) -> void:
	if _owned.has(id):
		return
	_owned[id] = true
	_save()
	inventory_changed.emit()

func owned_ids() -> Array[String]:
	var arr: Array[String] = []
	for k in _owned.keys():
		arr.append(String(k))
	return arr

func _load() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		_seed_starter()
		_save()
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		_seed_starter()
		return
	var d: Variant = JSON.parse_string(f.get_as_text())
	_owned.clear()
	if typeof(d) == TYPE_DICTIONARY:
		var arr: Array = d.get("owned", [])
		for id in arr:
			_owned[String(id)] = true
	if _owned.is_empty():
		_seed_starter()
		_save()

func _seed_starter() -> void:
	_owned.clear()
	for id in STARTER_IDS:
		_owned[id] = true

func _save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_error("Cannot write inventory.json")
		return
	var arr: Array = []
	for k in _owned.keys():
		arr.append(String(k))
	f.store_string(JSON.stringify({"owned": arr}, "\t"))
