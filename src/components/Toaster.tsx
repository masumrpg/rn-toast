import { ToastManager } from "../managers/ToastManager";
import { Toast } from "./Toast";

/**
 * A component that should be placed in the root of your app to render toasts.
 * This component is required for the toast system to function.
 *
 * @example
 * function App() {
 *   return (
 *     <>
 *       <Toaster />
 *       <MainComponent />
 *     </>
 *   );
 * }
 */
export const Toaster = () => {
  return (
    <Toast
      ref={(ref) => {
        if (ref) ToastManager.setToastRef(ref);
      }}
    />
  );
};
