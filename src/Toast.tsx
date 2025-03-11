import React, {
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import {
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Dimensions,
  View,
  Text,
  ImageSourcePropType,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";

// Import default images
import successImg from "./assets/images/success.png";
import errorImg from "./assets/images/error.png";
import infoImg from "./assets/images/info.png";

// Constants
const SCREEN_WIDTH = Dimensions.get("window").width;
const ICON_SIZE = 20;
const PADDING = 12;
const CONTAINER_SIZE = ICON_SIZE + PADDING * 2;
const MAX_QUEUE_SIZE = 2; // Maximum queue size limit
const THROTTLE_DELAY = 300; // Minimum delay between toast show requests in ms

// Types
export type ToastType = "info" | "success" | "error";

export interface ToastOptions {
  /** Duration in milliseconds before the toast disappears. Default is 4000ms. */
  duration?: number;
  /** Animation duration in milliseconds. Default is 400ms. */
  animationDuration?: number;
}

interface ToastRef {
  /** Show a toast with a message, type, and optional configuration. */
  show: (message: string, type: ToastType, options?: ToastOptions) => void;
  /** Hide the toast, with an optional callback after hiding. */
  hide: (callback?: () => void) => void;
}

// Toast Manager Singleton
class ToastManagerSingleton {
  private static instance: ToastManagerSingleton;
  private toastRef: ToastRef | null = null;
  private listeners: Set<(ref: ToastRef) => void> = new Set();
  private isAnimating: boolean = false;
  private queue: {
    message: string;
    type: ToastType;
    options?: ToastOptions;
  }[] = [];
  private lastToastTime: number = 0;

  private constructor() {}

  /** Get the singleton instance of ToastManager. */
  static getInstance(): ToastManagerSingleton {
    if (!ToastManagerSingleton.instance) {
      ToastManagerSingleton.instance = new ToastManagerSingleton();
    }
    return ToastManagerSingleton.instance;
  }

  /** Set the toast reference to manage global toasts. */
  setToastRef(ref: ToastRef | null) {
    if (ref) {
      this.toastRef = ref;
      // Notify any pending listeners
      this.listeners.forEach((listener) => listener(ref));
      this.listeners.clear();

      // Process any queued toasts
      this.processQueue();
    }
  }

  /** Set animation state */
  setAnimating(isAnimating: boolean) {
    this.isAnimating = isAnimating;
    if (!isAnimating) {
      this.processQueue();
    }
  }

  /** Process queued toast messages */
  private processQueue() {
    if (!this.isAnimating && this.queue.length > 0 && this.toastRef) {
      const nextToast = this.queue.shift();
      if (nextToast && nextToast.message && nextToast.message.trim() !== "") {
        this.isAnimating = true;
        this.lastToastTime = Date.now();
        this.toastRef.show(
          nextToast.message,
          nextToast.type,
          nextToast.options,
        );
      } else {
        // Skip empty messages and process next item
        this.processQueue();
      }
    }
  }

  /** Check if a toast request is valid */
  private isValidToastRequest(message: string): boolean {
    // Check if message is empty or just whitespace
    return message !== undefined && message !== null && message.trim() !== "";
  }

  /** Show a toast message. */
  show(message: string, type: ToastType = "info", options?: ToastOptions) {
    // Validate message content
    if (!this.isValidToastRequest(message)) {
      return; // Ignore empty messages
    }

    // Throttle rapid toast requests
    const now = Date.now();
    if (now - this.lastToastTime < THROTTLE_DELAY) {
      // If request is too soon after the last one, queue it instead
      if (this.queue.length < MAX_QUEUE_SIZE) {
        this.queue.push({ message, type, options });
      }
      return;
    }

    if (this.toastRef && !this.isAnimating) {
      this.isAnimating = true;
      this.lastToastTime = now;
      this.toastRef.show(message, type, options);
    } else {
      // Check if queue has reached maximum size
      if (this.queue.length < MAX_QUEUE_SIZE) {
        // Queue the show request
        this.queue.push({ message, type, options });

        if (!this.toastRef) {
          // Wait for ref to be available
          this.onReady((ref) => {
            this.processQueue();
          });
        }
      }
      // If queue is already at maximum size, the request is ignored
    }
  }

  /** Hide the currently visible toast. */
  hide(callback?: () => void) {
    if (this.toastRef) {
      this.toastRef.hide(() => {
        this.isAnimating = false;
        if (callback) callback();
        this.processQueue();
      });
    }
  }

  // Add a listener for when the toast is ready
  private onReady(callback: (ref: ToastRef) => void) {
    if (this.toastRef) {
      callback(this.toastRef);
    } else {
      this.listeners.add(callback);
    }
  }
}

/** Singleton instance to manage toasts globally. */
export const ToastManager = ToastManagerSingleton.getInstance();

/** The main Toast component. This should be rendered once in your app. */
interface ToastComponentProps {
  defaultDuration?: number;
  defaultAnimationDuration?: number;
  customIcons?: {
    success?: ImageSourcePropType;
    error?: ImageSourcePropType;
    info?: ImageSourcePropType;
  };
  customColors?: {
    success?: { background: string; text: string };
    error?: { background: string; text: string };
    info?: { background: string; text: string };
  };
}

interface ToastConfig {
  text?: string;
  type?: ToastType;
  visible: boolean;
  duration: number;
  animationDuration: number;
}

export const Toast = forwardRef<ToastRef, ToastComponentProps>((props, ref) => {
  const {
    defaultDuration = 4000,
    defaultAnimationDuration = 400,
    customIcons,
    customColors
  } = props;

  const [config, setConfig] = useState<ToastConfig>({
    text: undefined,
    type: undefined,
    visible: false,
    duration: defaultDuration,
    animationDuration: defaultAnimationDuration,
  });

  const [textWidth, setTextWidth] = useState(0);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const isAnimating = useRef(false);

  // Animated values
  const transY = useSharedValue(-100);
  const toastWidth = useSharedValue(CONTAINER_SIZE);
  const textOpacity = useSharedValue(0);

  // Function to update animation status safely
  const updateAnimationStatus = (status: boolean) => {
    isAnimating.current = status;
    ToastManager.setAnimating(status);
  };

  useImperativeHandle(ref, () => ({
    show: (
      message: string,
      type: ToastType = "info",
      options?: ToastOptions,
    ) => {
      // Skip empty messages
      if (!message || message.trim() === "") {
        updateAnimationStatus(false);
        return;
      }

      const animationDuration =
        options?.animationDuration || defaultAnimationDuration;
      const duration = options?.duration || defaultDuration;

      showToast(message, type, animationDuration, duration);
    },
    hide: (callback?: () => void) => {
      hideToast(callback);
    },
  }));

  // Register with the global ToastManager
  useEffect(() => {
    const refObject = {
      show: (message: string, type: ToastType, options?: ToastOptions) => {
        // Skip empty messages
        if (!message || message.trim() === "") {
          updateAnimationStatus(false);
          return;
        }

        const animationDuration =
          options?.animationDuration || defaultAnimationDuration;
        const duration = options?.duration || defaultDuration;

        showToast(message, type, animationDuration, duration);
      },
      hide: hideToast,
    };

    ToastManager.setToastRef(refObject);

    return () => {
      // Clean up on unmount
      ToastManager.setToastRef(null);
    };
  }, []);

  // Animation when text width changes
  useEffect(() => {
    if (textWidth > 0 && config.text && config.visible) {
      const totalWidth = Math.min(
        CONTAINER_SIZE + textWidth + PADDING,
        SCREEN_WIDTH - 32,
      );

      // Cancel any ongoing animations
      cancelAnimation(toastWidth);
      cancelAnimation(textOpacity);

      toastWidth.value = withDelay(
        config.animationDuration,
        withTiming(totalWidth, { duration: config.animationDuration }),
      );

      textOpacity.value = withDelay(
        config.animationDuration * 2,
        withTiming(1, { duration: config.animationDuration }),
      );
    }
  }, [textWidth, config.text, config.visible, config.animationDuration]);

  // Animated styles
  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: transY.value }],
  }));

  const animatedInnerStyle = useAnimatedStyle(() => ({
    width: toastWidth.value,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  // Measure text width
  const onTextLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width && width !== textWidth) {
      setTextWidth(width);
    }
  };

  function showToast(
    text: string,
    type: ToastType,
    animationDuration: number,
    displayDuration: number,
  ) {
    // Validate text content
    if (!text || text.trim() === "") {
      updateAnimationStatus(false);
      return;
    }

    // Clear any existing timers
    if (timer.current) {
      clearTimeout(timer.current);
    }

    // Cancel any ongoing animations
    cancelAnimation(transY);
    cancelAnimation(toastWidth);
    cancelAnimation(textOpacity);

    // Set animation status
    updateAnimationStatus(true);

    // Reset animation
    toastWidth.value = CONTAINER_SIZE;
    textOpacity.value = 0;

    // Update config
    setConfig({
      text,
      type,
      visible: true,
      duration: displayDuration,
      animationDuration,
    });

    // Ensure text width is properly measured on next cycle
    setTimeout(() => {
      // Show toast
      transY.value = withTiming(80, { duration: animationDuration });

      // Auto-hide after duration
      timer.current = setTimeout(() => {
        hideToast();
      }, displayDuration);
    }, 0);
  }

  function hideToast(callback?: () => void) {
    if (!isAnimating.current && transY.value === -100) {
      // Toast is already hidden
      if (callback) callback();
      return;
    }

    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    const animDuration = config.animationDuration;

    // Cancel any ongoing animations
    cancelAnimation(transY);
    cancelAnimation(toastWidth);
    cancelAnimation(textOpacity);

    // Reverse animation
    textOpacity.value = withTiming(0, { duration: animDuration / 2 });

    toastWidth.value = withDelay(
      animDuration / 2,
      withTiming(CONTAINER_SIZE, { duration: animDuration / 2 }),
    );

    transY.value = withDelay(
      animDuration,
      withTiming(-100, { duration: animDuration }, () => {
        runOnJS(completeHideAnimation)(callback);
      }),
    );
  }

  // Function to handle completion of hide animation
  const completeHideAnimation = (callback?: () => void) => {
    updateAnimationStatus(false);
    resetConfig();
    if (callback) callback();
  };

  function resetConfig() {
    setConfig((prev) => ({
      ...prev,
      text: undefined,
      type: undefined,
      visible: false,
    }));
  }

  // Toast styling helpers
  function getIconSource() {
    if (customIcons && config.type && customIcons[config.type]) {
      return customIcons[config.type];
    }

    switch (config.type) {
      case "success":
        return successImg;
      case "error":
        return errorImg;
      default:
        return infoImg;
    }
  }

  function getBackgroundColor() {
    if (customColors && config.type && customColors[config.type]) {
      return customColors[config.type]!.background;
    }

    switch (config.type) {
      case "success":
        return "#d8e3d6";
      case "error":
        return "#d2c5c6";
      default:
        return "#c5c9d2";
    }
  }

  function getTextColor() {
    if (customColors && config.type && customColors[config.type]) {
      return customColors[config.type]!.text;
    }

    switch (config.type) {
      case "success":
        return "#2a7e1a";
      case "error":
        return "#ce3f4a";
      default:
        return "#3f82ce";
    }
  }

  // Only render if we have actual text content
  if (!config.text || config.text.trim() === "") {
    return null;
  }

  return (
    <>
      {/* Hidden text measuring component */}
      {config.text && (
        <View style={styles.hiddenTextContainer} pointerEvents="none">
          <Text
            style={{
              color: getTextColor(),
              fontWeight: "500",
              fontSize: 16,
            }}
            onLayout={onTextLayout}
          >
            {config.text}
          </Text>
        </View>
      )}

      {/* Toast component */}
      <Animated.View style={[styles.container, animatedContainerStyle]}>
        <Animated.View
          style={[
            styles.innerContainer,
            animatedInnerStyle,
            { backgroundColor: getBackgroundColor() },
          ]}
        >
          <Image source={getIconSource()} style={styles.image} />
          <View style={styles.textContainer}>
            <Animated.Text
              numberOfLines={1}
              style={[
                {
                  color: getTextColor(),
                  fontWeight: "500",
                  fontSize: 16,
                },
                animatedTextStyle,
              ]}
            >
              {config.text}
            </Animated.Text>
          </View>
        </Animated.View>
      </Animated.View>
    </>
  );
});

// Styles
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: "center",
  },
  innerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PADDING,
    height: CONTAINER_SIZE,
    borderRadius: CONTAINER_SIZE / 2,
    overflow: "hidden",
  },
  image: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  textContainer: {
    overflow: "hidden",
    marginLeft: PADDING,
  },
  hiddenTextContainer: {
    position: "absolute",
    top: -1000,
    left: -1000,
    opacity: 0,
  },
});

export interface ToastProps {
  showToast: (
    message: string,
    type?: ToastType,
    options?: ToastOptions,
  ) => void;
  hideToast: (callback?: () => void) => void;
}

/**
 * Hook to control toasts programmatically.
 * Provides methods to show and hide toast messages.
 *
 * @returns {object} An object containing `showToast` and `hideToast` functions.
 *
 * @example
 * const { showToast, hideToast } = useToast();
 * showToast("This is an info toast", "info");
 */
export function useToast(): ToastProps {
  return {
    /**
     * Show a toast message.
     *
     * @param {string} message - The message to be displayed in the toast.
     * @param {ToastType} [type="info"] - The type of toast ("info", "success", "error").
     * @param {ToastOptions} [options] - Optional configurations like duration and animation speed.
     *
     * @example
     * showToast("Operation successful", "success", { duration: 3000 });
     */
    showToast: (
      message: string,
      type: ToastType = "info",
      options?: ToastOptions,
    ) => {
      // Skip empty messages
      if (!message || message.trim() === "") {
        return;
      }
      ToastManager.show(message, type, options);
    },

    /**
     * Hide the currently visible toast.
     *
     * @param {() => void} [callback] - Optional callback function that executes after the toast is hidden.
     *
     * @example
     * hideToast(() => console.log("Toast dismissed"));
     */
    hideToast: (callback?: () => void) => {
      ToastManager.hide(callback);
    },
  };
}

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
  return <Toast ref={(ref) => ref && ToastManager.setToastRef(ref)} />;
};