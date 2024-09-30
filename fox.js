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
        idle: 5,
        idle2: 14,
        movement: 8,
        catch: 11,
        damage: 5,
        sleep: 6,
        death: 7,
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
    const indicies = {
        idle: 0,
        idle2: 1,
        movement: 2,
        catch: 3,
        damage: 4,
        sleep: 5,
        death: 6,
    };
    return indicies[name] * sprite.width;
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

async function fox_loop() {
    var frame = 0;
    var count = 0;
    var idle_loop = set_idle_loop_count();
    var animation = "idle";
    var mode = "idle";
    var direction = 1;
    var currPos = { y: 0, x: 0, };
    var mousePos = { y: sprite.width * 0.5, x: sprite.width * 0.5 };

    document.addEventListener("mousemove", (event) => {
        mousePos = {
            x: event.clientX,
            y: event.clientY,
        };
    });

    while (true) {
        ctx.save();
        ctx.scale(direction, 1);
        ctx.drawImage(
            sprite.sheet,
            x_offset(frame), y_offset(animation), sprite.width, sprite.width,
            0, 0, canvas.width * direction, canvas.height);
        ctx.restore();

        frame += 1;

        switch (mode) {
            case "idle": {
                if (!is_mouse_touching_fox(currPos, mousePos, sprite.width)) {
                    mode = "chase";
                    animation = "movement";
                    frame = 0;
                }
                break;
            }
            case "chase": {
                if (is_mouse_touching_fox(currPos, mousePos, sprite.width)) {
                    mode = "idle";
                    animation = "idle";
                    frame = 0;
                }
                break;
            }
        }

        // movement
        if (fox_direction(currPos, mousePos, sprite.width) != direction) {
            direction *= -1;
        }
        if (mode == "chase") {
            const angle = find_angle(currPos, mousePos, sprite.width);
            const dy = Math.sin(angle) * sprite.velocity;
            const dx = Math.cos(angle) * sprite.velocity;
            currPos.y += dy;
            currPos.x += dx;
            canvas.style.top = currPos.y + "px";
            canvas.style.left = currPos.x + "px";
        }

        // animation
        if (frame == sprite.frames[animation]) {
            frame = 0;
            switch (animation) {
                case "idle": {
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
            }
        }

        await sleep(1000/sprite.fps);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

sprite.sheet.addEventListener("load", () => {
    setTimeout(async () => {
        await fox_loop();
    });
});
