extends Node

enum Mode { LOBBY, CLIENT_REQUEST, OWN_ROOM, SHOP }

signal mode_changed(new_mode: int)

var current: int = Mode.LOBBY

func set_mode(m: int) -> void:
	if m == current:
		return
	current = m
	mode_changed.emit(current)

func is_client() -> bool:
	return current == Mode.CLIENT_REQUEST

func is_own() -> bool:
	return current == Mode.OWN_ROOM

func is_shop() -> bool:
	return current == Mode.SHOP

func is_lobby() -> bool:
	return current == Mode.LOBBY
