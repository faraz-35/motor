import { requireNativeModule } from 'expo';

type MotorAlarmsNative = {
  scheduleDaily(hour: number, minute: number): Promise<void>;
  cancelDaily(): Promise<void>;
  armStopAlarm(atEpochMs: number): Promise<void>;
  cancelStopAlarm(): Promise<void>;
  snoozeStopAlarm(minutes: number): Promise<void>;
  setSnoozeMinutes(minutes: number): Promise<void>;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  exactAlarmsEnabled(): boolean;
  notificationsEnabled(): boolean;
  openAutostartSettings(): boolean;
  openExactAlarmSettings(): Promise<void>;
  openNotificationSettings(): Promise<void>;
};

export default requireNativeModule<MotorAlarmsNative>('MotorAlarms');
