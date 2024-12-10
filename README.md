# node-concurrent-worker-tasks

This library provides a solution for managing concurrent tasks in a Node.js environment. It leverages a combination of worker threads organized into a pool and a task queue system to efficiently execute tasks, ensuring optimal utilization of system resources and enhancing application performance.

## Table of Contents
<!-- no toc -->
  - [About](#about)
  - [Installation and usage](#installation-and-usage)
  - [Support](#support)
  - [Changelog](#changelog)


## About

node-concurrent-worker-tasks is specifically designed for Node.js environments and utilizes the native worker_threads module from Node.js (https://nodejs.org/api/worker_threads.html).

Features:
* Worker Pool Management: Efficiently manages a pool of worker threads, dynamically scaling the pool size based on demand.
* Task Queue System: Implements a queue mechanism to handle tasks that cannot be processed immediately, ensuring reliable task execution.
* Dynamic Worker Pool Scaling: Adjusts the worker pool size dynamically to optimize resource utilization.


## Installation and usage

  * Install the Worker Pool Module

First, install the worker-pool-task-queue module using npm:

```js
$ npm install node-concurrent-worker-tasks
$ pnpm install node-concurrent-worker-tasks
```

  * Create a Worker Pool

Import the WorkerPool class from the installed module and set up a worker pool with a specific pool size, worker script file path, and maximum number of workers:

```js
const WorkerPool = require('node-concurrent-worker-tasks');
// Create a worker pool with 30 workers, using 'Worker.js' as the worker script
const TaskPool = new WorkerPool(poolSize = 30, './Worker.js', returnLog = false);

```
  * Create the Worker.js File in ypur repro containing your functions. Note that functions can be handled in external libraries and classes (fn is representative for your functions, used with a delay in the example)

```js
const { parentPort } = require('worker_threads');

parentPort.on('message', async (message) => {
    const { fn } = message;
    // execute 'myfunc' here, return result in postMessage
    setTimeout(() => {
        parentPort.postMessage({ executed: `function ${fn} true` });
    }, 1000);
});
```

  * Define and Execute Tasks

Create functions to execute tasks using the worker pool. For example, you can define an executeTask function that runs a specific function called 'myfunc' in the worker pool:

```js
async function executeTask() {
    try {
        const result = await TaskPool.runTask({ fn: 'myfunc', params: { set: true } });
        console.log(result);
    } catch (error) {
        console.error(error);
    }
}
```

You can then call this function multiple times using a loop or any other logic as needed:

```js
async function executeTasksMultipleTimes() {
    for (let i = 0; i < 4; i++) {
        await executeTask();
    }
}

executeTasksMultipleTimes();
```

## Output

- status: 200 - default task
- status: 429 - concurrent task, maybe add pool extension later

```js
returnLog = false
{
  status: 200,
  result: { execute: true, taskId: 'd92fb982-02bc-4af0-a241-869dacb9f6ba' },
}
```

```js
returnLog = true
{
  status: 429,
  result: { execute: true, taskId: 'd92fb982-02bc-4af0-a241-869dacb9f6ba' },
  worker: '-1-',
  resultFreeMemory: '10445.57 MB',
  memUsedMB: '159.75 MB',
  memUsedPercent: '1.5%',
  poolLength: '29 worker',
  executed: '99 tasks'
}
```

## Support

This library used jsdoc types and is tested in Chrome
https://www.npmjs.com/package/node-concurrent-worker-tasks

## How to Use Apache Benchmark (ab) for Testing

To test the performance of your Node.js application using Apache Benchmark (ab), follow these steps:

Install Apache Benchmark (ab): If ab is not already installed on your system, you can typically install it via your package manager. For instance, on Ubuntu:

```bash
sudo apt-get install apache2-utils
```

Run the Benchmark Test: Open your terminal and use the following command to start testing your application:

```bash
ab -n <number_of_requests> -c <concurrent_requests> http://localhost:3000/task
```

```bash
ab -n 100 -c 20 http://localhost:3000/task
```

This command will send 100 requests to the server, with 20 requests being processed concurrently at any given time.

Interpret the Results: After running ab, it will display various statistics such as requests per second, response times, and the number of failed requests. Use this data to gauge the performance of your application under load.

## Changelog

Version 0.0.2:
- Initial release with worker pool management.
- Implemented task queue system.
- Dynamic scaling of worker pool based on demand.
