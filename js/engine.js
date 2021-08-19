const CellState = Object.fromEntries(["HEAD", "TAIL", "WIRE", "DEAD"].map((name, index) => [name, index]));

const numberFormatter = new Intl.NumberFormat();
const maxFrameTime = 1000 / 10;
const desiredFrameTime = 1000 / 60;

const headGridIndices = [];
const tailGridIndices = [];

let width, height, cells, numCells, generation;
let firstHead = null,
	firstTail = null;

let turboActive = false;
let turboStepSize = 1;
let turboStartTime = null;
let turboStartGeneration;
let turboTimeout = null;

const x_ = 0;
const y_ = 1;
const index_ = 2;
const gridIndex_ = 3;
const firstState_ = 4;
const neighbors_ = 5;
const numNeighbors_ = 13;
const next_ = 14;
const headCount_ = 15;
const isWire_ = 16;

const makeCell = (index, firstState, x, y) => {
	return [
		x, // x
		y, // y
		index, // index
		y * width + x, // gridIndex
		firstState, // firstState
		Array(8).fill(null), // neighbors
		0, // numNeighbors
		null, // next
		0, // headCount
		0, // isWire
	].flat();
};

const initialize = (data, restoredRender = null) => {
	width = data.width;
	height = data.height;

	numCells = 0;
	cells = [];
	const cellGrid = Array(height)
		.fill()
		.map((_) => Array(width));

	data.cellStates.forEach((row, y) =>
		row.forEach((firstState, x) => {
			if (firstState == null || firstState === CellState.DEAD) {
				return;
			}

			const cell = makeCell(numCells, firstState, x, y);
			cells[numCells] = cell;
			cellGrid[y][x] = cell;
			numCells++;
		})
	);

	for (const cell of cells) {
		const x = cell[x_];
		const y = cell[y_];
		for (let yOffset = -1; yOffset < 2; yOffset++) {
			if (y + yOffset < 0 || y + yOffset >= height) {
				continue;
			}
			for (let xOffset = -1; xOffset < 2; xOffset++) {
				if (yOffset === 0 && xOffset === 0) {
					continue;
				}
				if (x + xOffset < 0 || x + xOffset >= width) {
					continue;
				}
				const neighbor = cellGrid[y + yOffset][x + xOffset];
				if (neighbor != null) {
					cell[neighbors_ + cell[numNeighbors_]] = neighbor;
					cell[numNeighbors_]++;
				}
			}
		}
	}

	reset(restoredRender);
};

const reset = (restoredRender) => {
	generation = restoredRender?.generation ?? 0;
	firstHead = null;
	firstTail = null;
	let lastHead = null;
	let lastTail = null;

	const restoredHeadGridIndices = new Set(restoredRender?.headGridIndices ?? []);
	const restoredTailGridIndices = new Set(restoredRender?.tailGridIndices ?? []);

	for (let i = 0; i < numCells; i++) {
		const cell = cells[i];
		let resetState = cell[firstState_];

		if (restoredRender != null) {
			if (restoredHeadGridIndices.has(cell[gridIndex_])) {
				resetState = CellState.HEAD;
			} else if (restoredTailGridIndices.has(cell[gridIndex_])) {
				resetState = CellState.TAIL;
			} else {
				resetState = CellState.WIRE;
			}
		}

		cell[isWire_] = 0;
		switch (resetState) {
			case CellState.HEAD:
				if (firstHead == null) {
					firstHead = cell;
				} else {
					lastHead[next_] = cell;
				}
				lastHead = cell;
				break;
			case CellState.TAIL:
				if (firstTail == null) {
					firstTail = cell;
				} else {
					lastTail[next_] = cell;
				}
				lastTail = cell;
				break;
			case CellState.WIRE:
				cell[isWire_] = 1;
				break;
		}
	}
	render();
};

const update = () => {
	generation++;

	// generate new list of heads from heads
	let firstNewHead = null;
	let lastNewHead = null;
	let numNeighbors, neighbor;

	// add all wire neighbors of heads to new heads list and count their head neighbors
	for (let cell = firstHead; cell != null; cell = cell[next_]) {
		numNeighbors = cell[numNeighbors_];
		for (let i = 0; i < numNeighbors; i++) {
			neighbor = cell[neighbors_ + i];
			if (neighbor[isWire_] === 1) {
				if (neighbor[headCount_] === 0) {
					if (firstNewHead == null) {
						firstNewHead = neighbor;
					} else {
						lastNewHead[next_] = neighbor;
					}
					lastNewHead = neighbor;
				}
				neighbor[headCount_]++;
			}
		}
	}
	if (lastNewHead != null) {
		lastNewHead[next_] = null;
	}

	// remove cells from front of list until first cell is a valid new head
	while (firstNewHead != null && firstNewHead[headCount_] > 2) {
		firstNewHead[headCount_] = 0;
		firstNewHead = firstNewHead[next_];
	}

	// remove cells from list if they are invalid
	for (let cell = firstNewHead; cell != null; cell = cell[next_]) {
		while (cell[next_] != null && cell[next_][headCount_] > 2) {
			cell[next_][headCount_] = 0;
			cell[next_] = cell[next_][next_];
		}
		cell[headCount_] = 0;
		cell[isWire_] = 0;
	}

	// turn all tails to wires
	for (let cell = firstTail; cell != null; cell = cell[next_]) {
		cell[isWire_] = 1;
	}

	firstTail = firstHead;
	firstHead = firstNewHead;
};

const render = () => {
	headGridIndices.length = 0;
	tailGridIndices.length = 0;
	for (let cell = firstHead; cell != null; cell = cell[next_]) {
		headGridIndices.push(cell[gridIndex_]);
	}
	for (let cell = firstTail; cell != null; cell = cell[next_]) {
		tailGridIndices.push(cell[gridIndex_]);
	}

	let simulationSpeed = "---";
	if (turboActive) {
		simulationSpeed = numberFormatter.format(Math.round((1000 * (generation - turboStartGeneration)) / (Date.now() - turboStartTime)));
	}

	postMessage({
		type: "render",
		args: [
			{
				generation: numberFormatter.format(generation),
				simulationSpeed,
				width,
				height,
				headGridIndices,
				tailGridIndices,
			},
		],
	});
};

const advance = () => {
	update();
	render();
};

const startTurbo = () => {
	turboActive = true;
	turboStartGeneration = generation;
	turboStartTime = Date.now();
	let turboTime = turboStartTime;
	let now;
	let lastRender = turboStartTime;

	const loopTurbo = () => {
		for (let i = 0; i < turboStepSize; i++) {
			update();
			update();
			update();
			update();
			update();
			update();
		}

		now = Date.now();

		const diff = now - turboTime;
		if (diff > maxFrameTime && turboStepSize > 1) {
			turboStepSize >>= 1; // Halve it
		} else if (diff * 2 < maxFrameTime) {
			turboStepSize <<= 1; // Double it
		}
		turboTime = now;

		if (now - lastRender > desiredFrameTime) {
			lastRender = now;
			render();
		}

		turboTimeout = setTimeout(loopTurbo, 0);
	};
	loopTurbo();
};

const stopTurbo = () => {
	turboActive = false;
	clearTimeout(turboTimeout);
	turboTimeout = null;
};

const engine = {
	initialize,
	advance,
	reset,
	startTurbo,
	stopTurbo,
};

self.addEventListener("message", (event) => engine[event.data.type]?.(...(event.data.args ?? [])));
