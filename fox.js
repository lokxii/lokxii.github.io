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
    fps: 10
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function x_offset(frame) {
    return sprite.width * frame
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

async function fox_loop() {
    var frame = 0;
    var animation = "idle";
    while (true) {
        ctx.drawImage(
            sprite.sheet,
            x_offset(frame), y_offset(animation), sprite.width, sprite.width,
            0, 0, canvas.width, canvas.height);

        frame += 1;
        if (frame == sprite.frames[animation]) {
            frame = 0;
            if (animation == "idle") {
                animation = "idle2";
            } else {
                animation = "idle";
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
