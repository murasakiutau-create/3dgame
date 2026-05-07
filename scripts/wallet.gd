extends Node

const SAVE_PATH := "user://wallet.json"

signal gold_changed(new_amount: int)

var gold: int = 0

func _ready() -> void:
	_load()

func add(amount: int) -> void:
	if amount == 0:
		return
	gold = max(0, gold + amount)
	_save()
	gold_changed.emit(gold)

func can_spend(amount: int) -> bool:
	return gold >= amount

func spend(amount: int) -> bool:
	if amount < 0 or gold < amount:
		return false
	gold -= amount
	_save()
	gold_changed.emit(gold)
	return true

func _load() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if f == null:
		return
	var d: Variant = JSON.parse_string(f.get_as_text())
	if typeof(d) == TYPE_DICTIONARY:
		gold = int(d.get("gold", 0))

func _save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_error("Cannot write wallet.json")
		return
	f.store_string(JSON.stringify({"gold": gold}))
