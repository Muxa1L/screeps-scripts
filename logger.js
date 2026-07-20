var lastLogged = {};

function throttle(key, interval, message) {
    if (!lastLogged[key] || Game.time - lastLogged[key] >= interval) {
        lastLogged[key] = Game.time;
        if (message !== undefined) console.log(message);
        return true;
    }
    return false;
}

function info(message) {
    if (Game.time % 100 === 0) console.log('[' + Game.time + '] ' + message);
}

module.exports = {
    throttle: throttle,
    info: info,
};
