const resultsDiv = document.querySelector('#results');
const loadingDiv = document.querySelector('#loading');
const lastOddsDistancesDiv = document.querySelector('#last_odds_distances');
const calcTotalDepositInput = document.querySelector('#calc_total_deposit');
const calcShotsInput = document.querySelector('#calc_shots');
const calcBetPointOutput = document.querySelector('#calc_bet_point_output');
// const statisticsDiv = document.querySelector('#statistics');
const seedInput = document.querySelector('#seed_input');
const hashStatusDiv = document.querySelector('#hash_status');
const amountInput = document.querySelector('#amount_input');
// const usBlockHashCheckbox = document.querySelector('#use_stake_us_block_hash');
// const updateButton = document.querySelector('#update_button');
// const crashesCount = document.querySelector('#crashes_count');

const blockHash = '0000000000000000001b34dc6a1e86083f95500b096231436e9b25cbdd0075c4';
// const usBlockHash = '000000000000000000066448f2f56069750fc40c718322766b6bdf63fdcf45b8';

// const amountInput = document.querySelector('#amount_input');
// const goodValueInput = document.querySelector('#good_value_input');

// loading values.
// amountInput.value = localStorage.getItem('amount') ?? 100;
// goodValueInput.value = localStorage.getItem('goodValue') ?? 2;
// usBlockHashCheckbox.checked = localStorage.getItem('usBlockHash') == 'true';

let timeout = null;
let currentHash = '';
let hashUpdateInterval = null;
let lastOddsValue = null; // tracks the most recent odds value
let lastChain = []; // keeps the current computed chain (most recent first)
let isHashRequestInFlight = false; // prevents overlapping requests

// Function to update hash status display
function updateHashStatus(status, message) {
	hashStatusDiv.className = `hash-status ${status}`;
	hashStatusDiv.textContent = message;
}

// Function to fetch the latest hash from the API (streams SSE until a valid JSON data line is parsed)
async function fetchLatestHash() {
    if (isHashRequestInFlight) return;
    isHashRequestInFlight = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch('https://edge-stake.onrender.com/events/stake', {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            headers: { 'Accept': 'text/event-stream' },
            signal: controller.signal
        });

        if (!response.ok || !response.body) {
            throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let candidateDataLines = [];
        let latestHash = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            // Keep last partial line for next iteration
            buffer = lines.pop() || '';

            for (const raw of lines) {
                const line = raw.trim();
                if (!line) {
                    // Blank line indicates event dispatch; try to parse accumulated data
                    if (candidateDataLines.length) {
                        const joined = candidateDataLines.join('\n');
                        candidateDataLines = [];
                        let parsed;
                        try {
                            parsed = JSON.parse(joined);
                            const maybeHash = parsed && parsed.data && parsed.data.crash_data && parsed.data.crash_data[0] && parsed.data.crash_data[0].hash;
                            if (maybeHash) {
                                latestHash = maybeHash;
                                break;
                            }
                        } catch (_) {
                            // Not JSON; ignore and continue
                        }
                    }
                    continue;
                }

                if (line.startsWith('data:')) {
                    candidateDataLines.push(line.replace(/^data:\s*/, ''));
                }
                // Ignore other SSE fields like event:, id:, retry:
            }

            if (latestHash) break;
        }

        try { reader.cancel(); } catch (_) {}

        if (!latestHash) {
            // No valid JSON payload with hash found this round; do not treat as error
            return;
        }

        if (latestHash && (latestHash !== currentHash || !currentHash)) {
            const isFirstHash = !currentHash;
            currentHash = latestHash;
            seedInput.value = currentHash;
            if (isFirstHash) {
                OnInputChange();
            } else {
                setTimeout(() => { OnInputChange(); }, 100);
            }
            updateHashStatus('connected', `Live feed active • Latest hash: ${currentHash.substring(0, 8)}...`);
        } else if (currentHash) {
            updateHashStatus('connected', `Live feed active • Latest hash: ${currentHash.substring(0, 8)}...`);
        }
    } catch (error) {
        if (error && error.name === 'AbortError') {
            // Silent timeout; try again on next interval
            return;
        }
        console.error('Error fetching the latest hash:', error);
        updateHashStatus('error', 'Connection failed • Retrying...');
    } finally {
        clearTimeout(timeoutId);
        isHashRequestInFlight = false;
    }
}

// Start monitoring for hash updates every 3 seconds
function startHashMonitoring() {
	updateHashStatus('connecting', 'Connecting to live feed...');
	// Fetch initial hash
	fetchLatestHash();
    // Set up periodic fetching every 3 seconds
    hashUpdateInterval = setInterval(fetchLatestHash, 3000);
}

// Stop monitoring
function stopHashMonitoring() {
	if (hashUpdateInterval) {
		clearInterval(hashUpdateInterval);
		hashUpdateInterval = null;
	}
}

// Function to update results with current settings
function updateResults() {
	if (seedInput.value) {
		OnInputChange();
	}
}

// Function to set amount from preset buttons
function setAmount(value) {
	amountInput.value = value;
	updateResults();
}

// Function to set odds threshold from preset buttons
function setOddsThreshold(value) {
	const firstOddsInput = document.querySelector('.odds-input');
	if (firstOddsInput) {
		firstOddsInput.value = value;
		
		// Change the color attribute based on the value
		let color = 'green'; // default
		if (value === 1.05) {
			color = 'peacock';
		} else if (value === 1.10) {
			color = 'navy';
		} else if (value === 1.4) {
			color = 'orange';
		} else if (value === 2) {
			color = 'green';
		} else if (value === 5) {
			color = 'purple';
		} else if (value === 20) {
			color = 'red';
		}
		
		firstOddsInput.setAttribute('data-color', color);
		
		// Update the color indicator
		const colorIndicator = firstOddsInput.parentElement.querySelector('.odds-color-indicator');
		if (colorIndicator) {
			// Remove all color classes
			colorIndicator.className = 'odds-color-indicator';
			// Add the new color class
			colorIndicator.classList.add(color);
		}
		
		updateResults();
	}
}

// Available colors for odds thresholds
const availableColors = ['green', 'blue', 'purple', 'orange', 'red', 'yellow'];
let usedColors = ['green']; // Track which colors are in use

// Function to get next available color
function getNextAvailableColor() {
	for (let color of availableColors) {
		if (!usedColors.includes(color)) {
			return color;
		}
	}
	// If all colors are used, cycle through them
	return availableColors[usedColors.length % availableColors.length];
}

// Function to add a new odds input
function addOddsInput() {
	const oddsInputs = document.getElementById('odds_inputs');
	const newColor = getNextAvailableColor();
	usedColors.push(newColor);
	
	const group = document.createElement('div');
	group.className = 'odds-input-group';
	group.innerHTML = `
		<input type="number" class="odds-input" value="5.0" min="1" step="0.1" data-color="${newColor}" />
		<span class="odds-color-indicator ${newColor}"></span>
		<button class="remove-odds" onclick="removeOddsInput(this)">×</button>
	`;
	
	oddsInputs.appendChild(group);
	
	// Show remove buttons if there are more than 1 input
	updateRemoveButtons();
	
	// Add event listener to the new input
	const newInput = group.querySelector('.odds-input');
	newInput.addEventListener('input', updateResults);
}

// Function to remove an odds input
function removeOddsInput(button) {
	const group = button.parentElement;
	const input = group.querySelector('.odds-input');
	const color = input.getAttribute('data-color');
	
	// Remove color from used colors
	usedColors = usedColors.filter(c => c !== color);
	
	group.remove();
	updateRemoveButtons();
	updateResults();
}

// Function to update visibility of remove buttons
function updateRemoveButtons() {
	const groups = document.querySelectorAll('.odds-input-group');
	const removeButtons = document.querySelectorAll('.remove-odds');
	
	removeButtons.forEach(button => {
		button.style.display = groups.length > 1 ? 'flex' : 'none';
	});
}

// Function to get color class based on multiplier and odds thresholds
function getColorClass(multiplier) {
	const oddsInputs = document.querySelectorAll('.odds-input');
	const thresholds = [];
	
	// Collect all thresholds with their colors
	oddsInputs.forEach(input => {
		const value = parseFloat(input.value);
		const color = input.getAttribute('data-color');
		if (!isNaN(value)) {
			thresholds.push({ value, color });
		}
	});
	
	// Sort thresholds by value (ascending)
	thresholds.sort((a, b) => a.value - b.value);
	
	// Find the highest threshold that the multiplier meets or exceeds
	let matchedColor = null;
	for (let threshold of thresholds) {
		if (multiplier >= threshold.value) {
			matchedColor = threshold.color;
		}
	}
	
	// Return appropriate class
	if (matchedColor) {
		return `threshold-${matchedColor}`;
	} else {
		return 'below-threshold';
	}
}

// Initialize odds inputs event listeners
function initializeOddsInputs() {
	const oddsInputs = document.querySelectorAll('.odds-input');
	oddsInputs.forEach(input => {
		input.addEventListener('input', updateResults);
	});
	updateRemoveButtons();
}

// Start monitoring when the page loads
window.addEventListener('load', () => {
	startHashMonitoring();
	initializeOddsInputs();
    initializeBetCalculator();
});

seedInput.addEventListener('keyup', (ev) => {
	if (ev.key == 'Enter') {
		ev.preventDefault();

		OnInputChange();
	}
});

$(resultsDiv).selectable({
	stop: UpdateSelectionWindow,
});

seedInput.addEventListener('input', (ev) => {
	OnInputChange();
});
/* amountInput.addEventListener('input', (ev) => {
	OnInputChange();

	const amount = parseInt(amountInput.value);

	if (isNaN(amount)) return;
	localStorage.setItem('amount', amount);
});
goodValueInput.addEventListener('input', (ev) => {
	OnInputChange();

	const goodValue = parseFloat(goodValueInput.value);

	if (isNaN(goodValue)) return;
	localStorage.setItem('goodValue', goodValue);
});
usBlockHashCheckbox.addEventListener('change', (ev) => {
	OnInputChange();

	localStorage.setItem('usBlockHash', usBlockHashCheckbox.checked);
}); */

/* updateButton.addEventListener('click', (ev) => {
	OnInputChange(true);
}); */

function OnInputChange(byButton = false) {
	if (!seedInput.value) {
		loadingDiv.innerHTML = '';
		resultsDiv.innerHTML = '';
        if (lastOddsDistancesDiv) lastOddsDistancesDiv.innerHTML = '';
        updateBetCalculator();
		return;
	}

	let seed = seedInput.value;
	let amount = parseInt(amountInput.value) || 100;

    GetChain(seed, amount);
	UpdateSelectionWindow();
    updateBetCalculator();
}

function GetChain(seed, amount = 1000) {
	resultsDiv.innerHTML = '';

	let chain = [seed];
	amount -= 1;

	if (amount < 0) chain = [];

	for (let i = 0; i < amount; i++) {
		chain.push(
			CryptoJS.algo.SHA256.create()
				.update(chain[chain.length - 1])
				.finalize()
				.toString(CryptoJS.enc.Hex)
		);
	}

	const seedToPoint = (seed, i) => {
		const hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, seed);
		hmac.update(blockHash);

		const hex = hmac.finalize().toString(CryptoJS.enc.Hex).substring(0, 8);
		const dec = parseInt(hex, 16);
		const f = (4294967296 / (dec + 1)) * (1 - 0.01);
		const floored = Math.floor(f * 100) / 100;

		const point = Math.max(1.0, parseFloat(floored.toFixed(2)));

		return point;
	};

    chain = chain.map(seedToPoint);

    for (let value of chain) {
		let multiplier = value;

		const div = document.createElement('div');
		div.textContent = multiplier.toFixed(2);
		const colorClass = getColorClass(multiplier);
		div.className = `crash ${colorClass}`;
		resultsDiv.appendChild(div);
	}

    // Update last odds value (first element is the most recent)
	lastChain = chain.slice();
	lastOddsValue = chain.length > 0 ? chain[0] : null;
    updateLastOddsDistances();
}

function initializeBetCalculator() {
    if (calcTotalDepositInput) calcTotalDepositInput.addEventListener('input', updateBetCalculator);
    if (calcShotsInput) calcShotsInput.addEventListener('input', updateBetCalculator);
}

function computeBetPoint(totalDeposit, numberOfShots) {
    if (!isFinite(totalDeposit) || totalDeposit <= 0) return 0;
    if (!Number.isFinite(numberOfShots) || numberOfShots <= 0) return 0;
    const half = totalDeposit / 2;
    const perShot = half / numberOfShots;
    return perShot;
}

function formatBetPoint(value) {
    if (!isFinite(value) || value <= 0) return '0';
    const withPrecision = value.toFixed(8);
    return withPrecision.replace(/\.?(0)+$/, '');
}

function updateBetCalculator() {
    if (!calcBetPointOutput) return;
    const total = parseFloat(calcTotalDepositInput && calcTotalDepositInput.value ? calcTotalDepositInput.value : '');
    const shots = parseInt(calcShotsInput && calcShotsInput.value ? calcShotsInput.value : '');
    const betPoint = computeBetPoint(total, shots);
    calcBetPointOutput.textContent = formatBetPoint(betPoint);
}

// Fixed ladder values to compare distances against
// Top thresholds are measured specially (see updateLastOddsDistances)
const TOP_DISTANCE_TARGETS = [1, 1.1, 1.4, 2];
const OTHER_DISTANCE_TARGETS = [5, 10, 20, 30, 50, 100, 200, 500]; // 1000 removed as requested

function updateLastOddsDistances() {
	if (!lastOddsDistancesDiv) return;
	if (!lastChain || lastChain.length === 0) {
		lastOddsDistancesDiv.innerHTML = '';
		return;
	}

	// Helper to compute distance from start index to first occurrence >= target
	function distanceSince(target, startIndexInclusive) {
		const start = Math.min(lastChain.length, Math.max(0, startIndexInclusive));
		let foundIndex = -1;
		for (let i = start; i < lastChain.length; i++) {
			if (lastChain[i] >= target) {
				foundIndex = i;
				break;
			}
		}
		if (foundIndex === -1) {
			return lastChain.length - start;
		}
		return foundIndex - start;
	}

	// Helper: distance when searching backward from a starting boundary
	function distanceReverseSince(target, startIndexExclusive) {
		const start = Math.min(lastChain.length, Math.max(0, startIndexExclusive));
		let foundIndex = -1;
		for (let i = start - 1; i >= 0; i--) {
			if (lastChain[i] >= target) {
				foundIndex = i;
				break;
			}
		}
		if (foundIndex === -1) {
			return start;
		}
		return start - foundIndex;
	}

	// Find the first time we hit <= 1.10 (1.1 or below odds)
	let firstLeqOnePointOneIndex = -1;
	for (let i = 0; i < lastChain.length; i++) {
		if (lastChain[i] <= 1.10) {
			firstLeqOnePointOneIndex = i;
			break;
		}
	}
	if (firstLeqOnePointOneIndex === -1) firstLeqOnePointOneIndex = lastChain.length; // safeguard

	// Build items: top thresholds measured in REVERSE from the first <= 1.10 occurrence
	const topItems = TOP_DISTANCE_TARGETS.map(target => {
		const since = distanceReverseSince(target, firstLeqOnePointOneIndex);
		return `<div class="odds-distance-item top-row"><span class="label">${target}</span><span class="value">${since}</span></div>`;
	}).join('');

	const otherItems = OTHER_DISTANCE_TARGETS.map(target => {
		const since = distanceSince(target, 0);
		return `<div class="odds-distance-item"><span class="label">${target}</span><span class="value">${since}</span></div>`;
	}).join('');

	lastOddsDistancesDiv.innerHTML = topItems + otherItems;
}

/* function UpdateStatistics(totalCount = 0, goodCount = 0) {
	if (!totalCount) {
		statisticsDiv.classList.add('hide');
		return;
	}

	statisticsDiv.classList.remove('hide');
	const lossCount = totalCount - goodCount;
	const goodPercentage = ((goodCount / totalCount) * 100).toFixed(2);
	const lossPercentage = ((lossCount / totalCount) * 100).toFixed(2);

	statisticsDiv.innerHTML = `<span class="good">${goodCount}</span>/${totalCount} Wins (<span class="good">${goodPercentage}%</span> Chance) • <span class="bad">${lossCount}</span>/${totalCount} Losses (<span class="bad">${lossPercentage}%</span> Chance)`;
} */

function UpdateSelectionWindow() {
	// let selectedElements = document.querySelectorAll('.ui-selected');
	// console.log(selectedElements);
	// if (selectedElements.length == 0) {
	// 	crashesCount.classList.add('hide');
	// 	return;
	// } else {
	// 	crashesCount.classList.remove('hide');
	// }

	// let goodElements = document.querySelectorAll('.ui-selected.bom');
	// let count = selectedElements.length;
	// let goodCount = goodElements.length;

	// crashesCount.innerHTML = `
	//         <div>${count} selected</div>
	//         <div><span class="good">${goodCount}</span>/${count}</div>
	//    `;
}

/* function HandleUpdateButtonVisibility(amount) {
	if (amount >= 5000) {
		updateButton.classList.remove('hide');
	} else {
		updateButton.classList.add('hide');
	}
} */
