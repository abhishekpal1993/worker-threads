// export DEBUG='*,-follow-redirects'
// node packt_new_threads_product_csv.js --csv='./products.csv'
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const debug = require('debug');
const axios = require('axios');

debug.enable('*,-follow-redirects');

if (isMainThread) {
  const productIds = [
    "9781838823818",
    "9781789615869",
    "9781789951226",
    "9781838983994",
    "9781839218040",
    "9781782165125",
    "9781787122932",
    "9781782166429",
    "9781838823818",
    "9781789615869",
    "9781789951226",
    "9781838983994",
    "9781839218040",
    "9781782165125",
    "9781787122932",
    "9781782166429",
  ];
  const SPLICE_NUMBER = 2;
  const NUMBER_OF_WORKER_THREADS = 4;
  let threads = 0;
  const results = [];

  const logger = {
    custom: (objName, text) => debug(objName)(text),
    error: (key, err) => debug(`Error::${key}:`)(err),
  };

  // limit number of threads working in parallel
  const createBatches = () => {
    for (let index = 0; index < NUMBER_OF_WORKER_THREADS; index++) {
      const threadId = `Thread${++threads}`;
      const batchProducts = productIds.splice(0, SPLICE_NUMBER);
      callWorkers(threadId, batchProducts);
    }
  };

  const callWorkers = (threadId, batchProducts) => {
    const port = new Worker(__filename, {
      workerData: { batchProducts, threadId }
    });

    port.on("message", (data) => {
      logger.custom(threadId, data);
      results.push(...data);
    });
    port.on("error", (data) => {
      logger.custom(`Master:${threadId}:`, data);
      process.exit();
    });
    port.on("exit", () => {
      logger.custom(`${threadId}`, 'Stopped!');
      logger.custom('Results Array', results);
      // if products remaining for check, create new thread
      if (productIds.length > 0) {
        const threadId = `Thread${++threads}:`;
        const batchProducts = productIds.splice(0, SPLICE_NUMBER);
        callWorkers(threadId, batchProducts);
      }
    });
  }

  createBatches();
} else {
  const { batchProducts, threadId } = workerData;

  const logger = {
    runtime: debug(`${threadId}`),
    error: function (key, err) {
      const extendedThreadId = this.runtime.extend(key);
      extendedThreadId(err);
    },
  };

  const axiosRequest = (url) => {
    const req = axios.create();
    req.countOfRequest = 1;
    req.interceptors.response.use(
      (resp) => {
        req.countOfRequest = 1;
        return resp;
      },
      (error) => {
        if (error.config) {
          if (req.countOfRequest <= 10) {
            const { config } = error;
            req.countOfRequest += 1;
            return req.request(config);
          } else if (error.response) {
            const { status, statusText, headers, config } = error.response;
            logger.error('axiosRequest', { status, statusText, headers, config });
          }
        }

        return Promise.reject(error);
      },
    );
    return req.get(url);
  };

  const fetchSummary = (productId) => `https://static.packt-cdn.com/products/${productId}/summary`;

  const fetchDetails = (product) => {
    const returnObject = {
      product,
      exists: 'false',
    };
    const url = fetchSummary(product);

    // fetch the coverImage details
    return axiosRequest(url)
      .then(() => {
        returnObject.exists = 'true';
      })
      .catch((err) => logger.error('error', err))
      .then(() => returnObject);
  };

  (async () => {
    const promises = [];
    batchProducts.forEach((product) => {
      promises.push(fetchDetails(product));
    });

    Promise.all(promises)
      .then((data) => parentPort.postMessage(data))
      .then(() => process.exit())
      .catch((err) => logger.error('Promise.All', err));
  })();
}
