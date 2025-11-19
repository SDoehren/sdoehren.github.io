const DEFAULT_SETTINGS = {
    "min": 3,
    "max": 15,
    "points": 30,
    "availablepoints": null,
    "cost": {
        3: -9, 4: -6, 5: -4, 6: -2, 7: -1, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9, 16: 12, 17: 15,
        18: 19
    },
    "costrealign": {},
    "costinverse": {},
}

var LOCAL_SETTINGS = DEFAULT_SETTINGS

function calculateadditionalsettings() {
    LOCAL_SETTINGS.costrealign = {}
    LOCAL_SETTINGS.costinverse = {}

    for (const [key, value] of Object.entries(LOCAL_SETTINGS['cost'])) {
        if ((key <= LOCAL_SETTINGS.max) && (key >= LOCAL_SETTINGS.min)) {
            let newv = value - LOCAL_SETTINGS.cost[LOCAL_SETTINGS.min]
            LOCAL_SETTINGS.costrealign[key] = newv
            LOCAL_SETTINGS.costinverse[newv] = parseInt(key)
        }
    }

    LOCAL_SETTINGS.availablepoints = LOCAL_SETTINGS.points - LOCAL_SETTINGS.cost[LOCAL_SETTINGS.min] * 6

}


function getcosts() {
    var costs = {}
    for (let i = 3; i <= 18; i++) {
        costs[i] = parseInt(document.getElementById(`abilitypointcost-${i}-value`).value)
    }

    var lastcost = -Infinity


    var badvalues = []
    for (const [key, value] of Object.entries(costs)) {
        if (value <= lastcost) {
            badvalues.push(key)
        }
        lastcost = value
    }
    let ERROR = document.getElementById("ERROR MESSAGE");

    if (badvalues.length > 0) {
        ERROR.innerHTML = "<h1>Error</h1>"
        for (let i = 0; i < badvalues.length; i++) {
            ERROR.innerHTML += `An Ability score of ${badvalues[i] - 1} has a cost higher or equal to that of ${badvalues[i]}<br>`;
        }
        ERROR.innerHTML += `You will need to correct these in the settings to continue`;
        ERRORFIRED = true;
    } else {
        ERROR.innerHTML = ""
        LOCAL_SETTINGS.cost = costs
        ERRORFIRED = false;
    }
}

function processsettings() {
    LOCAL_SETTINGS.points = parseInt(document.getElementById("Points Available").value);
    LOCAL_SETTINGS.min = parseInt(document.getElementById("Min Ability Score").value);
    LOCAL_SETTINGS.max = parseInt(document.getElementById("Max Ability Score").value);


    getcosts()
    calculateadditionalsettings()
}

function getroll() {
    let rolls = []

    for (var i = 1; i <= 6; i++) {
        let s = document.getElementById("Roll" + i).value;
        s = parseInt(s);
        rolls.push(s);
    }

    rolls = rolls.sort((a, b) => a - b);
    return rolls;
}


function rolltopoints(rolls) {
    rolls = rolls.sort((a, b) => a - b);

    let redist1 = []
    let minroll = Math.min(...rolls)
    for (let i = 0; i < 6; i++) {
        redist1.push(rolls[i] - minroll)
    }

    if (redist1.reduce((a, b) => a + b, 0) === 0) {
        redist1 = [1, 1, 1, 1, 1, 1]
    }

    let redist2 = []
    let maxredist = Math.max(...redist1)
    for (let i = 0; i < 6; i++) {
        redist2.push(redist1[i] / maxredist)
    }

    let pointsdist = []
    let points = Math.max(...Object.keys(LOCAL_SETTINGS.costinverse).map(x => parseInt(x)))
    for (let i = 0; i < 6; i++) {
        pointsdist.push(Math.round(redist2[i] * points))
    }
    return pointsdist
}


function adjustPointsDist(pointsdist) {
    const sum = arr => arr.reduce((s, v) => s + v, 0);

    let guard = 0; // safety to prevent infinite loops in case no change is possible
    const MAX_ITERS = 1000;

    while ((LOCAL_SETTINGS.availablepoints - sum(pointsdist)) !== 0) {

        if (++guard > MAX_ITERS) {

            console.warn('adjustPointsDist: iteration limit reached; breaking to avoid infinite loop');
            break;
        }

        const error = LOCAL_SETTINGS.availablepoints - sum(pointsdist);
        const internalvalues = pointsdist.slice(1, -1); // pointsdist[1:-1] in Python
        const pack = [0, 0, 0, 0];
        let availabletospend = Math.abs(error);
        if (error > 0) {
            // allocate from right-to-left (3 down to 0)
            for (let i = 3; i >= 0; i--) {
                if (internalvalues[i] < LOCAL_SETTINGS.costrealign[LOCAL_SETTINGS.max]) {
                    pack[i] += 1;
                    availabletospend -= 1;
                }
                if (availabletospend <= 0) break;
            }
        } else {
            for (let i = 0; i < 4; i++) {
                if (internalvalues[i] > 0) {
                    pack[i] -= 1;
                    availabletospend -= 1;
                }
                if (availabletospend <= 0) break;
            }
        }

        const correction = [0, ...pack, 0]; // length matches pointsdist (e.g. 6)

        let changed = false;
        for (let i = 0; i < pointsdist.length && i < correction.length; i++) {
            if (correction[i] !== 0) {
                pointsdist[i] += correction[i];
                changed = true;
            }
        }
    }

    return pointsdist;
}


function alignpointstocosts(pointsdist, allsame = false) {
    // Normalize costinverse: sorted array (ascending) and a Set for membership test
    const costArr = Object.keys(LOCAL_SETTINGS.costinverse).map(x => parseInt(x));
    costArr.sort((a, b) => a - b);
    const costSet = new Set(costArr)

    // helper: all values are in costSet?
    const allInCost = arr => arr.every(x => costSet.has(x));

    // Safety guard to prevent infinite loops if nothing can be done
    let guard = 0;
    const MAX_ITERS = 1000;


    while (!allInCost(pointsdist)) {
        if (++guard > MAX_ITERS) {
            console.warn('snapPointsToCostInverse: iteration limit reached; breaking');
            break;
        }

        let pointsdisttemp = [];

        for (let i = 0; i < pointsdist.length; i++) {

            const v = pointsdist[i];


            // If v is already allowed, push as-is
            if (costSet.has(v)) {
                pointsdisttemp.push(v);
                continue;
            }

            // find the largest allowed value < v
            // (costArr is sorted ascending, so find last element < v)
            let newv = null;
            for (let k = costArr.length - 1; k >= 0; k--) {
                if (costArr[k] < v) {
                    newv = costArr[k];
                    break;
                }
            }

            // if no smaller allowed value exists, fallback to the smallest allowed value
            // (This mirrors Python behavior if that case could occur — adjust if you prefer different behaviour)
            if (newv === null) {
                newv = costArr[0];
            }

            // For each unit of difference, try to increment previous entries (right-to-left)
            const diff = Math.floor(v - newv);
            for (let r = 0; r < diff; r++) {
                // walk pointsdisttemp from end to start
                let increased = false;
                for (let j = pointsdisttemp.length - 1; j >= 0; j--) {
                    const candidate = pointsdisttemp[j] + 1;
                    if (costSet.has(candidate)) {
                        pointsdisttemp[j] = candidate;
                        increased = true;
                        break;
                    }
                }
                // If we couldn't increase any previous entry, stop trying to distribute
                if (!increased) break;
            }

            // append the reduced value
            pointsdisttemp.push(newv);
        }

        // replace pointsdist (like np.array(...) assignment in Python)
        pointsdist = pointsdisttemp;

        let leftover = LOCAL_SETTINGS.availablepoints - pointsdist.reduce((a, b) => a + b, 0)

        let guard2 = 0;
        const MAX_ITERS2 = 100;
        while (leftover !== 0) {
            if (++guard2 > MAX_ITERS2) {
                break;
            }

            for (let i = 0; i < 6; i++) {
                let v = pointsdist[i]
                for (let nv = v + 1; nv <= v + leftover; nv++) {
                    if (costSet.has(nv)) {
                        pointsdist[i] = nv
                        i = 99;
                        break;
                    }
                }
            }

            leftover = LOCAL_SETTINGS.availablepoints - pointsdist.reduce((a, b) => a + b, 0)
        }

    }

    return pointsdist;
}


function displayresult(abilities, points, leftover) {
    abilities = abilities.sort((a, b) => b - a)
    points = points.sort((a, b) => b - a)
    let s;
    let s2;
    for (i = 0; i < 6; i++) {
        s = document.getElementById("Ability" + (i + 1));
        s.value = abilities[i];
        s2 = document.getElementById("Points" + (i + 1));
        s2.value = points[i];
    }
    let left = document.getElementById("Leftover Points");
    left.value = leftover;
}

function errorhandler(level, message, fireerror = true) {
    let ERROR = document.getElementById("ERROR MESSAGE");
    ERROR.innerHTML = `<h1>${level}</h1>`
    ERROR.innerHTML += `${message}`


    ERRORFIRED = fireerror;
}


var ERRORFIRED = false

function main(roll = undefined) {
    ERRORFIRED = false


    processsettings()

    if (ERRORFIRED) {
        return;
    }

    if (LOCAL_SETTINGS.costrealign[LOCAL_SETTINGS.max] * 6 <= LOCAL_SETTINGS.availablepoints) {
        let message = `You have set the total points to be spent to ${LOCAL_SETTINGS.points}, 
        setting all abilities to the maximum (${LOCAL_SETTINGS.max}) only costs 
        ${LOCAL_SETTINGS.cost[LOCAL_SETTINGS.max] * 6} points.  
        <br>All abilities will be set to maximum regardless of the roll.`;

        errorhandler("Warning", message)

        let abs = Array(6).fill(LOCAL_SETTINGS.max)
        let pts = Array(6).fill(LOCAL_SETTINGS.cost[LOCAL_SETTINGS.max])
        let left = LOCAL_SETTINGS.availablepoints - (LOCAL_SETTINGS.costrealign[LOCAL_SETTINGS.max] * 6)

        displayresult(abs, pts, left)
    } else if (LOCAL_SETTINGS.costrealign[LOCAL_SETTINGS.min] * 6 >= LOCAL_SETTINGS.availablepoints) {
        let message = `You have set the total points to be spent to ${LOCAL_SETTINGS.points}, 
        setting all abilities above the minimum (${LOCAL_SETTINGS.min}) will cost 
        ${LOCAL_SETTINGS.cost[LOCAL_SETTINGS.min] * 6 + 1} points.  
        <br>All abilities will be set to minimum regardless of the roll.`;

        errorhandler("Warning", message)

        let abs = Array(6).fill(LOCAL_SETTINGS.min)
        let pts = Array(6).fill(LOCAL_SETTINGS.cost[LOCAL_SETTINGS.min])
        let left = LOCAL_SETTINGS.availablepoints - (LOCAL_SETTINGS.costrealign[LOCAL_SETTINGS.min] * 6)

        displayresult(abs, pts, left)
    }

    if (ERRORFIRED) {
        return;
    }

    let rollresult = roll ?? getroll()

    const allSame = rollresult.every(v => v === rollresult[0]);
    console.log(allSame);

    let pointsdist;
    if (allSame) {
        const costArr = Object.keys(LOCAL_SETTINGS.costinverse).map(x => parseInt(x));
        costArr.sort((a, b) => a - b);
        const costSet = new Set(costArr)

        console.log(LOCAL_SETTINGS.availablepoints / 6)
        let target = LOCAL_SETTINGS.availablepoints / 6
        let lo;
        let hi;
        for (let v = 0; v <= costArr.length - 1; v++) {
            if ((costArr[v] <= target) && (costArr[v + 1] > target)) {
                lo = costArr[v]
                hi = costArr[v + 1]
            }
        }

        console.log([target, lo, hi])
        let m;
        for (m = 0; m <= 6; m++) {
            let total = lo * m + hi * (6 - m)
            if (total<=LOCAL_SETTINGS.availablepoints){
                console.log([m,total])
                break;
            }
        }
        Array(m).fill(lo)
        Array(6-m).fill(hi)
        pointsdist = [...Array(m).fill(lo), ...Array(6-m).fill(hi)];


    } else {
        pointsdist = rolltopoints(rollresult)
        pointsdist = adjustPointsDist(pointsdist)
        pointsdist = alignpointstocosts(pointsdist)
    }


    let abs = pointsdist.map(x => LOCAL_SETTINGS.costinverse[x])

    let pointsdistnormed = abs.map(x => LOCAL_SETTINGS.cost[x])

    let leftover = LOCAL_SETTINGS.availablepoints - (pointsdist.reduce((a, b) => a + b, 0));
    displayresult(abs, pointsdistnormed, leftover)
    console.log(LOCAL_SETTINGS);
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max) + 1;
}

function randomiseroll(roll) {
    var rollresults = [];

    let rolls;
    let sumval;

    for (i = 1; i <= 6; i++) {
        switch (roll) {
            case "4d6dl":
                rolls = [getRandomInt(6), getRandomInt(6), getRandomInt(6), getRandomInt(6)];
                let minval = Math.min(...rolls);
                sumval = rolls.reduce((a, b) => a + b, 0) - minval;
                break;
            case "3d6":
                rolls = [getRandomInt(6), getRandomInt(6), getRandomInt(6)];
                sumval = rolls.reduce((a, b) => a + b, 0);
                break;
            case "1d20":
                rolls = [getRandomInt(20)];
                sumval = rolls.reduce((a, b) => a + b, 0);

        }
        rollresults.push(sumval);
    }


    rollresults.sort(function (a, b) {
        return b - a;
    });
    for (i = 0; i < 6; i++) {
        let a = i + 1
        var s = document.getElementById("Roll" + a);
        s.value = rollresults[i];
    }
    main(rollresults);
}