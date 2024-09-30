// https://elthen.itch.io/2d-pixel-art-fox-sprites

const canvas = document.querySelector(".fox-animation");
const ctx = canvas.getContext("2d");

const sprite = {
    sheet: (function () {
        const i = new Image();
        i.src = "assets/fox-sprite-sheet.png";
        return i; })(),
    width: 96,
    frames: {
        idle: { start: 0, end: 5, direction: 1, index: 0 },
        idle2: { start: 0, end: 14, direction: 1, index: 1 },
        turn: { start: 0, end: 5, direction: 1, index: 1 },
        movement: { start: 0, end: 8, direction: 1, index: 2 },
        catch: { start: 0, end: 11, direction: 1, index: 3 },
        damage: { start: 0, end: 5, direction: 1, index: 4 },
        sleep: { start: 0, end: 6, direction: 1, index: 5 },
        laydown: { start: 0, end: 7, direction: 1, index: 6 },
        wake1: { start: 7, end: 3, direction: -1, index: 6 },
        wake2: { start: 8, end: 11, direction: 1, index: 3 },
    },
    fps: 9,
    velocity: 15,
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function x_offset(frame) {
    return sprite.width * frame;
}

function y_offset(name) {
    return sprite.frames[name].index * sprite.width;
};

function set_idle_loop_count() {
    return Math.floor(Math.random() * 8) + 2;
}

function is_mouse_touching_fox(current, mouse, width) {
    return mouse.x >= current.x &&
        mouse.x < current.x + width &&
        mouse.y >= current.y + width * 0.5 &&
        mouse.y < current.y + width;
}

function find_angle(current, mouse, width) {
    const dx = (mouse.x - (current.x + width / 2));
    const dy = (mouse.y - (current.y + width / 2));
    return Math.atan2(dy, dx);
}

function fox_direction(current, mouse, width) {
    return mouse.x >= current.x + width * 0.5 ? 1 : -1
}

function move(current, mouse) {
    const angle = find_angle(current, mouse, sprite.width);
    const dy = Math.sin(angle) * sprite.velocity;
    const dx = Math.cos(angle) * sprite.velocity;
    current.y += dy;
    current.x += dx;
    canvas.style.top = current.y + "px";
    canvas.style.left = current.x + "px";
}

async function fox_loop() {
    var frame = 0;
    var count = 0;
    var idle_loop = set_idle_loop_count();
    var animation = "idle";
    var mode = "idle";
    var direction = 1;
    var currPos = { y: 0, x: 0, };
    var mousePos = { y: sprite.width * 0.5, x: sprite.width * 0.5 };
    var catchTarget = { y: 0, x: 0 };

    document.addEventListener("mousemove", (event) => {
        mousePos = {
            x: event.clientX,
            y: event.clientY,
        };
    });

    document.addEventListener("mousedown", (event) => {
        if (mode == "catch" || animation == "turn") {
            return;
        }
        if (mode == "sleep" && animation == "sleep") {
            if (is_mouse_touching_fox(currPos, mousePos, sprite.width)) {
                animation = "wake1";
                mode = "wake";
                frame = sprite.frames.wake1.start;
            }
            return;
        }
        mode = "catch";
        animation = "catch";
        frame = 0;
        catchTarget = {
            x: event.clientX,
            y: event.clientY,
        };
        if (fox_direction(currPos, mousePos, sprite.width) != direction) {
            direction *= -1;
        }
    });

    while (true) {
        // animation
        if (frame == sprite.frames[animation].end) {
            frame = 0;
            switch (animation) {
                case "idle": {
                    if (Math.random() > 0.8) {
                        animation = "laydown";
                        mode = "sleep";
                        break;
                    }
                    if (count == idle_loop) {
                        animation = "idle2";
                        count = 0;
                    } else {
                        count++;
                    }
                    break;
                }
                case "idle2": {
                    idle_loop = set_idle_loop_count();
                    animation = "idle";
                    break;
                }
                case "turn": {
                    direction *= -1;
                    animation = "idle";
                    mode = "idle";
                    break;
                }
                case "catch": {
                    animation = "idle2";
                    mode = "idle";
                    break;
                }
                case "laydown": {
                    animation = "sleep";
                    break;
                }
                case "wake1": {
                    animation = "wake2";
                    frame = sprite.frames.wake2.start;
                    break;
                }
                case "wake2": {
                    animation = "idle";
                    mode = "idle";
                    break;
                }
            }
        }

        ctx.save();
        ctx.scale(direction, 1);
        ctx.drawImage(
            sprite.sheet,
            x_offset(frame), y_offset(animation), sprite.width, sprite.width,
            0, 0, canvas.width * direction, canvas.height);
        ctx.restore();

        switch (mode) {
            case "idle": {
                if (fox_direction(currPos, mousePos, sprite.width) != direction) {
                    mode = "turn";
                    animation = "turn";
                    frame = 0;
                    break;
                }
                if (!is_mouse_touching_fox(currPos, mousePos, sprite.width)) {
                    mode = "chase";
                    animation = "movement";
                    frame = 0;
                }
                break;
            }
            case "chase": {
                if (fox_direction(currPos, mousePos, sprite.width) != direction) {
                    mode = "turn";
                    animation = "turn";
                    frame = 0;
                    break;
                }
                if (is_mouse_touching_fox(currPos, mousePos, sprite.width)) {
                    mode = "idle";
                    animation = "idle";
                    frame = 0;
                }
                break;
            }
        }

        // movement
        switch (mode) {
            case "chase": {
                if (frame < 1) {
                    break;
                }
                move(currPos, mousePos);
                break;
            }
            case "catch": {
                if (frame >= 3 && frame <= 6) {
                    move(currPos, catchTarget);
                }
                break;
            }
        }

        await sleep(1000/sprite.fps);
        frame += sprite.frames[animation].direction;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

sprite.sheet.addEventListener("load", () => {
    setTimeout(async () => {
        await fox_loop();
    });
});
