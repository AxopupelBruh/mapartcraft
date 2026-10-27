const workerUrls = new WeakMap();

export default class WorkerBuilder extends Worker {
  constructor(worker) {
    let url = workerUrls.get(worker);
    if (!url) {
      let code = worker.toString();
      code = code.substring(code.indexOf("{") + 1, code.lastIndexOf("}"));
      const blob = new Blob([code], { type: "application/javascript" });
      url = URL.createObjectURL(blob);
      workerUrls.set(worker, url);
    }
    return new Worker(url);
  }
}
