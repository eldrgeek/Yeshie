import { UseToastOptions, useToast } from "@chakra-ui/react";
import { EditorMode, INotificationProvider } from '@yeshie/shared';

type ToastFunction = ReturnType<typeof useToast>;

export class ChakraNotificationAdapter implements INotificationProvider {
  constructor(private toast: ToastFunction) {}

  private showToast(options: UseToastOptions) {
    this.toast({
      duration: 2000,
      isClosable: true,
      ...options
    });
  }

  showModeChange(mode: EditorMode): void {
    this.showToast({
      title: `Switched to ${mode.toUpperCase()} mode`,
      status: "info"
    });
  }

  showError(message: string): void {
    this.showToast({
      title: "Error",
      description: message,
      status: "error",
      duration: 3000
    });
  }

  showInfo(message: string): void {
    this.showToast({
      title: "Info",
      description: message,
      status: "info"
    });
  }
} 