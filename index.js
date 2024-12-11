const { Worker, workerData } = require('worker_threads');
const CustomError = require('./types/customError');
const os = require('os');
const freeMemoryAvailable = os.freemem() / 1024 / 1024; // Convert to MB

const tasks = [];

class TaskManager {
    constructor(idleThreshold = 100) {
        this.lastTaskTime = null;
        this.idleThreshold = idleThreshold;
    }

    canExecuteTask() {
        const now = Date.now();
        
        // If no previous task, always allow
        if (this.lastTaskTime === null) {
            this.lastTaskTime = now;
            return true;
        }

        // Check if enough time has passed since last task
        const timeSinceLastTask = now - this.lastTaskTime;
        const canExecute = timeSinceLastTask >= this.idleThreshold;

        if (canExecute) {
            this.lastTaskTime = now;
        }

        return canExecute;
    }
}

// Usage example
const taskManager = new TaskManager(); // 3 seconds idle threshold by default

class WorkerPool {
    /** Creates a new WorkerPool instance.
     * @param {number} poolSize - The size of the worker pool.
     * @param {string} workerFilePath - The file path of the worker script.
     * @param {number} minWorkers - The maximum number of workers allowed in the pool.
     */
    constructor(poolSize, workerFilePath, returnLog=true, memThreshold=90) {
        process.on('exit', () => {
            this.terminateAllWorkers();
        });

        process.on('SIGINT', () => {
            process.exit(0);
        });

        /** @type {number} */ this.poolSize = poolSize;
        /** @type {number} */ this.memThreshold = memThreshold;      
        /** @type {boolean} */ this.returnLog = returnLog; 
        /** @type {Array<WorkerObject>} */ this.pool = [];
        /** @type {string} */ this.workerFilePath = workerFilePath;
        this.buildPool();
    }

    run = async (task) => {//Main Entry
        try {
            let status = 200;
            if (!taskManager.canExecuteTask()) {
                status = 429;
            }
            return { status, ...await this.runTask(task) };         
        } catch (err) {
            return { status: err.status || 500, message: err.message || 'something went wrong' };
        } finally {
            this.terminateExcessWorkers();
        }
    };

    buildPool = async () => {
        return new Promise(async (resolve) => {
            for (let i = 0; i < this.poolSize; i++) {
                const worker = new Worker(this.workerFilePath, { workerData });
                const workerId = `-${i + 1}-`;

                const handleError = (error) => {
                    console.error(`Worker ${workerId} error:`, error);
                };
                worker.on('error', handleError);
                this.pool.push({ id: workerId, worker });
            }
            resolve();
        });
    }

    addNewWorkerToPool = async () => {
        return new Promise((resolve, reject) => {
            try {
                if (this.pool.length >= this.poolSize) {
                    resolve();
                    return;
                }

                const newWorker = new Worker(this.workerFilePath, { workerData });
                const workerId = `-${this.pool.length + 1}-`;
                newWorker.once('online', () => {
                    const workerItem = { id: workerId, worker: newWorker };
                    if (this.pool.length < this.poolSize) this.pool.push(workerItem);
                    resolve(workerItem);
                });
                newWorker.on('error', (error) => {
                    reject(new CustomError(error, 300));
                });
            } catch (error) {
                reject(new CustomError(error, 300));
            }
        });
    }

    executeWorker = async (workerFromPool, task) => {
        return new Promise(async (resolve) => {
            const { id, worker } = workerFromPool;
            if (!worker || typeof worker.on !== 'function') {
                const nextWorker = await this.addNewWorkerToPool();
                resolve(await this.executeWorker(nextWorker, task));
            }

            const cleanup = () => {
                worker.removeListener('message', messageListener);
                worker.removeListener('error', errorListener);
            };

            const messageListener = (data) => {
                resolve(data);
                if (this.pool.length < this.poolSize) {
                    this.pool.push(workerFromPool);
                }
                cleanup();
            };

            const errorListener = (error) => {
                cleanup();
                reject(new Error(`Worker failed during task execution: ${error.message || error}`));
            };

            worker.on('message', messageListener);
            worker.on('error', errorListener);
            try {
                worker.postMessage(task);
            } catch (err) {
                reject(new Error(`Failed to post task to worker: ${err.message || err}`));
            }
        });
    }

    createLog(freeWorker_id) {
        tasks.push(freeWorker_id);

        return {
            worker: freeWorker_id, 
            poolLength: `${this.pool.length} worker`,
            executed: `${tasks.length} tasks`,
        };
    }

    getMemPercent = () => {
        const freeMemory = os.freemem() / 1024 / 1024; // Convert to MB
        const memUsed = freeMemoryAvailable - freeMemory;
        const memPercent = ((memUsed / freeMemoryAvailable) * 100).toFixed(1);
    
        if (memPercent > 90) {
            throw new CustomError('Server capacity is low. Please try again later.', 503);
        }
    
        return memPercent < this.memThreshold
    };
    
    runTask = async (task) => {
        while (this.pool.length === 0) {
            await this.buildPool();
        }
        const freeWorker = this.pool.shift(); // Get a worker
        const memStats = this.getMemPercent(); // Check memory before task execution
        const result = await this.executeWorker(freeWorker, task);
        if (this.returnLog) {
            result.log = this.createLog(freeWorker.id);
        }
        result.capacity = memStats
        return { result };
    };

    terminateExcessWorkers() {
        while (this.pool.length > this.minWorkers) {
            console.log('terminateExcessWorkers', this.pool.length);
            const { worker } = this.pool.pop();
            worker.terminate();
        }
    }

    terminateAllWorkers() {
        while (this.pool.length > 0) {
            const { worker } = this.pool.pop();
            worker.terminate();
        }
    }
}

module.exports = WorkerPool;