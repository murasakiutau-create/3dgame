extends Node3D
class_name CameraIso

@export var zoom_min: float = 6.0
@export var zoom_max: float = 20.0
@export var zoom_step: float = 1.0
@export var rotate_time: float = 0.25

@onready var camera: Camera3D = $Camera3D

var _target_yaw: float = 0.0

func _ready() -> void:
	_target_yaw = rotation.y
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("camera_rotate_left"):
		_rotate_by(PI / 2.0)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("camera_rotate_right"):
		_rotate_by(-PI / 2.0)
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom(-zoom_step)
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom(zoom_step)
			get_viewport().set_input_as_handled()

func _rotate_by(delta: float) -> void:
	_target_yaw += delta
	var tw := create_tween()
	tw.tween_property(self, "rotation:y", _target_yaw, rotate_time)\
		.set_trans(Tween.TRANS_SINE)\
		.set_ease(Tween.EASE_OUT)

func _zoom(delta: float) -> void:
	camera.size = clamp(camera.size + delta, zoom_min, zoom_max)

## Project a viewport mouse position onto the y=0 plane in world space.
func mouse_to_ground(mouse_pos: Vector2) -> Vector3:
	var from := camera.project_ray_origin(mouse_pos)
	var dir := camera.project_ray_normal(mouse_pos)
	if absf(dir.y) < 0.0001:
		return from
	var t := -from.y / dir.y
	return from + dir * t
