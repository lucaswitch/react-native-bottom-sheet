import { useEffect } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  type KeyboardEventEasing,
  type KeyboardEventName,
  Platform,
} from 'react-native';
import {
  runOnUI,
  useAnimatedReaction,
  useSharedValue
} from 'react-native-reanimated';
import { useWorkletCallback } from './useWorkletCallback';
import { KEYBOARD_STATE, SCREEN_HEIGHT } from '../constants';

const KEYBOARD_EVENT_MAPPER = {
  KEYBOARD_SHOW: Platform.select({
    ios: 'keyboardWillShow',
    android: 'keyboardDidShow',
    default: '',
  }) as KeyboardEventName,
  KEYBOARD_HIDE: Platform.select({
    ios: 'keyboardWillHide',
    android: 'keyboardDidHide',
    default: '',
  }) as KeyboardEventName,
};

export const useKeyboard = () => {
  //#region variables
  const shouldHandleKeyboardEvents = useSharedValue(false);
  const keyboardState = useSharedValue<KEYBOARD_STATE>(
    KEYBOARD_STATE.UNDETERMINED
  );
  const keyboardHeight = useSharedValue(0);
  const keyboardAnimationEasing =
    useSharedValue<KeyboardEventEasing>('keyboard');
  const keyboardAnimationDuration = useSharedValue(500);
  // biome-ignore lint: to be addressed!
  const temporaryCachedKeyboardEvent = useSharedValue<any[]>([]);
  //#endregion

  //#region worklets
  const handleKeyboardEvent = useWorkletCallback(
    (
      state: KEYBOARD_STATE,
      height: number,
      duration: number,
      easing: KeyboardEventEasing,
      bottomOffset?: number
    ) => {
      'worklet';
      if (state === KEYBOARD_STATE.SHOWN && !shouldHandleKeyboardEvents.value) {
        /**
         * if the keyboard event was fired before the `onFocus` on TextInput,
         * then we cache the input, and wait till the `shouldHandleKeyboardEvents`
         * to be updated then fire this function again.
         */
        temporaryCachedKeyboardEvent.value = [state, height, duration, easing];
        return;
      }
      keyboardHeight.value =
        state === KEYBOARD_STATE.SHOWN ? height : keyboardHeight.value;

      /**
       * if keyboard had an bottom offset -android bottom bar-, then
       * we add that offset to the keyboard height.
       */
      if (bottomOffset) {
        keyboardHeight.value = keyboardHeight.value + bottomOffset;
      }

      keyboardAnimationDuration.value = duration;
      keyboardAnimationEasing.value = easing;
      keyboardState.value = state;
      temporaryCachedKeyboardEvent.value = [];
    },
    []
  );
  //#endregion

  //#region effects
  useEffect(() => {
    const handleOnKeyboardShow = (event: KeyboardEvent) => {
      runOnUI(handleKeyboardEvent)(
        KEYBOARD_STATE.SHOWN,
        event.endCoordinates.height,
        event.duration,
        event.easing,
        SCREEN_HEIGHT -
          event.endCoordinates.height -
          event.endCoordinates.screenY
      );
    };
    const handleOnKeyboardHide = (event: KeyboardEvent) => {
      runOnUI(handleKeyboardEvent)(
        KEYBOARD_STATE.HIDDEN,
        event.endCoordinates.height,
        event.duration,
        event.easing
      );
    };

    const showSubscription = Keyboard.addListener(
      KEYBOARD_EVENT_MAPPER.KEYBOARD_SHOW,
      handleOnKeyboardShow
    );

    const hideSubscription = Keyboard.addListener(
      KEYBOARD_EVENT_MAPPER.KEYBOARD_HIDE,
      handleOnKeyboardHide
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [handleKeyboardEvent]);

  /**
   * This reaction is needed to handle the issue with multiline text input.
   *
   * @link https://github.com/gorhom/react-native-bottom-sheet/issues/411
   */
  useAnimatedReaction(
    () => shouldHandleKeyboardEvents.value,
    result => {
      const params = temporaryCachedKeyboardEvent.value;
      if (result && params.length > 0) {
        handleKeyboardEvent(params[0], params[1], params[2], params[3]);
      }
    },
    []
  );
  //#endregion

  return {
    state: keyboardState,
    height: keyboardHeight,
    animationEasing: keyboardAnimationEasing,
    animationDuration: keyboardAnimationDuration,
    shouldHandleKeyboardEvents,
  };
};
