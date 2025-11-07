import type {WindowController} from './WindowController';

export class WindowRegistry {
    private readonly controllers = new Map<string, WindowController>();

    register<T extends WindowController>(controller: T): T {
        this.controllers.set(controller.id, controller);
        return controller;
    }

    get<T extends WindowController = WindowController>(id: string): T | undefined {
        return this.controllers.get(id) as T | undefined;
    }

    disposeAll(): void {
        for (const controller of this.controllers.values()) {
            controller.destroy();
        }
        this.controllers.clear();
    }
}
