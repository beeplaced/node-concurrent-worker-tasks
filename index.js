const { Worker, workerData, resourceLimits } = require('worker_threads');
const CustomError = require('./types/customError');
const os = require('os');
const totalMem = os.totalmem();  // Total RAM in bytes
const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
// console.log("totalMem",formatBytes(totalMem))
// console.log("freeMem",formatBytes(os.freemem()))

class WorkerPool {
    /**
     * @param {number} poolSize - The number of workers in the pool.
     * @param {string} workerFilePath - The worker script path.
     * @param {boolean} returnLog - Whether to return log details.
     * @param {number} minPercentage - Minimum free memory percentage.
     */
    constructor(poolSize, workerFilePath, returnLog = true, minPercentage = 20) {
        process.on('exit', () => this.terminateAllWorkers());
        process.on('SIGINT', () => process.exit(0));

        this.workerIndex = 0;
        this.poolSize = poolSize;
        this.minPercentage = minPercentage;
        this.maxWorkers = 10;
        this.maxListener = 11;
        this.returnLog = returnLog;
        this.workerFilePath = workerFilePath;
        this.pool = [];
        this.taskQueue = [];

        this.buildPool();
    }

    /**
     * Runs a task using an available worker.
     * @param {any} task - The task data.
     * @param {string} [taskId] - Optional UUID for tracking.
     * @returns {Promise<{result: any, workerId: string, taskId: string, executionTime: number}>}
     */
    async run(task, taskId) {
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ task, taskId, resolve, reject });
            this.assignTasks();
        });
    }

    /** Creates the worker pool */
    async buildPool() {
        try {
            for (let i = 0; i < this.poolSize; i++) {
                await this.addWorkerToPool();
            }
        } catch (error) {
            console.error("❌ Failed to build worker pool:", error);
        }
    }

    /** Adds a worker to the pool */
    async addWorkerToPool() {
        return new Promise((resolve, reject) => {
            try {
                const newWorker = new Worker(this.workerFilePath);
                const workerId = `Worker-${this.pool.length + 1}`;
                if (this.returnLog) console.log(`✅ Created ${workerId}`);
                newWorker.setMaxListeners(this.maxListener);
                // Main listener that always listens to messages
                newWorker.on('message', (data) => this.handleWorkerResult(newWorker, data, workerId));
                newWorker.on('error', (error) => console.error(`❌ Error in ${workerId}:`, error));
                newWorker.once('online', () => {
                    this.pool.push({ id: workerId, worker: newWorker, busy: false });
                    resolve();
                });

            } catch (error) {
                reject(new Error(`Failed to create worker: ${error.message}`));
            }
        });
    }

/** Handles worker results */
    handleWorkerResult(worker, result, workerId) {
        const workerItem = this.pool.find(w => w.worker === worker);
        workerItem.busy = false;
        
        if (this.returnLog) console.log(`Worker ${workerId} processing completed.`);

        if (workerItem.resolve) {
            const response = { result };
            try {
                if (this.returnLog) {
                    const executionTime = Date.now() - workerItem.startTime;
                    const taskId = workerItem.taskId;
                    console.log(`🔹 ${workerId} completed Task ${taskId} in ${executionTime}ms`);
                    const messageListenerCount = worker.listenerCount('message');
                    response.log = { workerId, messageListenerCount, taskId, executionTime };
                }
                workerItem.resolve(response);
                if (this.returnLog) console.log(`Worker ${workerId} successfully resolved task.`);  // Added log
            } catch (error) {
                console.error(`Error processing task for worker ${workerId}:`, error.message);
                if (workerItem.reject) {
                    workerItem.reject(new Error(`Worker ${workerId} failed during task ${workerItem.taskId}: ${error.message}`));
                }
            } finally {
                workerItem.resolve = null;
                workerItem.reject = null;
            }
        }

        this.assignTasks(); // Process queued tasks
    };

    /** Assigns tasks to free workers */
    assignTasks() {
        const freeWorker = this.pool.find(w => !w.busy);
        if (!freeWorker || this.taskQueue.length === 0) return;

        const { task, taskId, resolve, reject } = this.taskQueue.shift();
        freeWorker.busy = true;
        freeWorker.resolve = resolve;
        freeWorker.startTime = Date.now();
        freeWorker.taskId = taskId; // Assign task UUID

        if (this.returnLog) console.log(`🚀 Assigning Task ${taskId} to ${freeWorker.id} (Queue: ${this.taskQueue.length} left)`);
        freeWorker.worker.postMessage({ task, taskId });
    }

    /** Terminates all workers */
    terminateAllWorkers() {
        this.pool.forEach(({ worker, id }) => {
            if (this.returnLog) console.log(`🛑 Terminating ${id}`);
            worker.terminate();
        });
        this.pool = [];
    }
}

// class WorkerPool {
//     /** Creates a new WorkerPool instance.
//      * @param {number} poolSize - The size of the worker pool.
//      * @param {string} workerFilePath - The file path of the worker script.
//      * @param {number} maxWorkers - The maximum number of workers allowed in the pool.
//      */
//     constructor(poolSize, workerFilePath, returnLog=true, minPercentage=20) {
//         process.on('exit', () => {
//             this.terminateAllWorkers();
//         });

//         process.on('SIGINT', () => {
//             process.exit(0);
//         });
//         this.workerIndex = 0
//         /** @type {number} */ this.poolSize = poolSize;
//         /** @type {number} */ this.minPercentage = minPercentage
//         /** @type {number} */ this.maxWorkers = 10;
//         /** @type {number} */ this.maxListener = 11;
//         /** @type {boolean} */ this.returnLog = returnLog; 
//         /** @type {Array<WorkerObject>} */ this.pool = [];
//         /** @type {string} */ this.workerFilePath = workerFilePath;
//         try {
//             this.buildPool();
//         } catch (error) {
//             throw new CustomError(error.message, 503);
//         }
//     }

//     deleteWorkerFromPool = () => {
//         if (this.pool.length >= this.maxWorkers ) {
//             const { id, worker } = this.pool.pop();
//             worker.terminate();
//             console.log(`delete ${id} - length ${this.pool.length}`)
//         }
//     };

//     nextWorker = () => {
//         return new Promise((resolve) => {
//             this.workerIndex++;
//             if (this.workerIndex >= this.pool.length) this.workerIndex = 0 //Start at the beginning
//             resolve();
//         });
//     };

//     run = async (task) => {//Main Entry
//         if (this.pool.length === 0) await this.addWorkerToPool()
//             const workerFromPool = this.pool[this.workerIndex]; // Take last worker from pool
//             const { id, worker } = workerFromPool;
//             try {
//                 const freeMemPercentage = await this.checkMemCapacity()
//                 const messageListenerCount = worker.listenerCount('message');
//                 if (messageListenerCount >= 5) {
//                     await this.nextWorker()
//                  }
                 
//                 const result = await this.executeWorker(worker, task, id)

//                 // console.log('Message Listeners:', messageListenerCount);
//                 // console.log(`using worker ${id}`)

//                 if (this.returnLog) return { result, log: this.createLog(id, freeMemPercentage)};
//                 return { result };  
//             } catch (error) {
//                 console.log(error)
//                 const { status, message } = error
//                 throw new CustomError(message || 'something went wrong', status || 503);
//             }finally{

//                 //this.pool.push(workerFromPool);
//                 //console.log("put back",this.pool.length)
//                 //this.deleteWorkerFromPool()
//             }
//             //this.terminateExcessWorkers();
//     };

//     checkMemCapacity = async () => {//throw new CustomError('Catch Server capacity is low. Please try again later.', 503);
//         return new Promise((resolve) => {
//         const freeMem = os.freemem();    // Free memory in bytes
//         const freeMemPercentage = parseInt(((freeMem / totalMem) * 100).toFixed(1));
//         //console.log(`${freeMemPercentage} % free capacity`)
//         if (freeMemPercentage <= this.minPercentage ) {
//             //throw new CustomError('Catch Server capacity is low. Please try again later.', 503);
//         }
//         resolve(freeMemPercentage)
//         })
//     };

//     buildPool = async () => {
//         try {
//             for (let i = 0; i < this.poolSize; i++) {
//                 await this.addWorkerToPool()
//             }                          
//         } catch (error) {
//             throw new CustomError('buildPool failed. Please try again later.', 503);
//         }
//     };

//     addWorkerToPool = async () => {
//         return new Promise((resolve, reject) => {
//             try {
//                 const newWorker = new Worker(this.workerFilePath, { workerData });
//                 const workerId = `-${this.pool.length + 1}-`;
//                 newWorker.setMaxListeners(this.maxListener); // Set a max listener limit
//                 newWorker.once('online', () => {
//                 const workerItem = { id: workerId, worker: newWorker };
//                     this.pool.push(workerItem);
//                     resolve(workerItem);
//                 });
//                 newWorker.on('error', (error) => {//add errorlistener
//                     reject(new CustomError(error.message, 300));
//                 });
//             } catch (error) {
//                 reject(new CustomError(error.message, 300));
//             }
//         });
//     };

//     executeWorker = async (worker, task, id) => {
//         return new Promise((resolve, reject) => {
//             const messageListener = (data) => {
//                 worker.removeListener('message', messageListener); // Remove only this task's listener
//                 if (worker.listenerCount('message') >= worker.getMaxListeners()) {
//                     console.warn(`Worker-${id} exceeded max listeners! Cleaning...`);
//                     worker.removeAllListeners('message'); // Remove all old listeners
//                 }
//                 resolve(data);
//             };
//             worker.once('message', messageListener); // Attach safely
//             try {
//                 worker.postMessage(task);
//             } catch (err) {
//                 console.log("executeWorker",err)
//                 worker.removeListener('message', messageListener); // Ensure cleanup on failure
//                 reject(new Error(`Worker-${id} failed to post task: ${err.message || err}`));
//             }
//         });
//     };
    
//     createLog(freeWorker_id, freeMemPercentage) {
//         const mem = process.memoryUsage();     
//         return {
//             worker: freeWorker_id,
//             poolLength: `${this.pool.length} worker`,
//             RSS: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
//             heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
//             freeMemPercentage
//             };
//     };

//     terminateAllWorkers() {
//         while (this.pool.length > 0) {
//             const { id, worker } = this.pool.pop();
    
//             // Log the number of listeners before termination
//             //console.log(`Worker ${id} has ${worker.listenerCount('message')} message listeners and ${worker.listenerCount('error')} error listeners before termination.`);
//             worker.terminate();
//         }
//     };
    
// }

module.exports = WorkerPool;