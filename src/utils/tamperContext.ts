import type { Context, AgentContextKeys as ContextKeys } from './contextKeys.d';

type ContextKey<T> = abstract new (...args: any[]) => T;

type SetHandler<K extends keyof ContextKeys> = (
  instance: ContextKeys[K],
  ctor: abstract new (...args: any[]) => ContextKeys[K],
  ctx: TamperContext,
  method: 'set' | 'forceSet'
) => ContextKeys[K];

class OriginalContext implements Context {
  readonly instances = new Map<ContextKey<any>, any>();

  get<T>(ctor: ContextKey<T>): T {
    const value = this.tryGet(ctor);
    if (value) return value;
    throw new Error(`No instance of ${ctor.name} has been registered.`);
  }

  tryGet<T>(ctor: ContextKey<T>): T | undefined {
    const value = this.instances.get(ctor);
    if (value) return value;
  }

  set<T>(ctor: ContextKey<T>, instance: T): void {
    if (this.tryGet(ctor)) {
      throw new Error(
        `An instance of ${ctor.name} has already been registered. Use forceSet() if you're sure it's a good idea.`
      );
    }
    this.assertIsInstance(ctor, instance);
    this.instances.set(ctor, instance);
  }

  forceSet<T>(ctor: ContextKey<T>, instance: T): void {
    this.assertIsInstance(ctor, instance);
    this.instances.set(ctor, instance);
  }

  assertIsInstance<T>(ctor: ContextKey<T>, instance: any): void {
    if (!(instance instanceof ctor)) {
      const inst = JSON.stringify(instance);
      throw new Error(`The instance you're trying to register for ${ctor.name} is not an instance of it (${inst}).`);
    }
  }
}

class TamperContext extends OriginalContext {
  readonly handlers = new Map<string, SetHandler<any>>();
  readonly instanceByName = new Map<string, any>();

  set<T>(ctor: ContextKey<T>, instance: T): void {
    const handler = this.handlers.get(ctor.name);
    if (handler) {
      instance = handler(instance, ctor, this, 'set');
    }
    super.set(ctor, instance);
    this.instanceByName.set(ctor.name, instance);
  }

  forceSet<T>(ctor: ContextKey<T>, instance: T): void {
    const handler = this.handlers.get(ctor.name);
    if (handler) {
      instance = handler(instance, ctor, this, 'forceSet');
    }
    super.forceSet(ctor, instance);
    this.instanceByName.set(ctor.name, instance);
  }

  tamper<K extends keyof ContextKeys>(ctorName: K, handler: SetHandler<K>) {
    this.handlers.set(ctorName, handler);
  }

  getByName<K extends keyof ContextKeys>(ctorName: K): ContextKeys[K] {
    const value = this.tryGetByName(ctorName);
    if (value) return value;
    throw new Error(`No instance of ${ctorName} has been registered.`);
  }
  tryGetByName<K extends keyof ContextKeys>(ctorName: K): ContextKeys[K] | undefined {
    const value = this.instanceByName.get(ctorName);
    if (value) return value;
  }
}

export { OriginalContext, TamperContext };
