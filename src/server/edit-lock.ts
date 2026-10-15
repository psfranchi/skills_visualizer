/** Serializes edit preview/apply so concurrent full scans do not race. */
export class EditLock {
  #tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#tail.then(task, task);
    this.#tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export const editLock = new EditLock();
