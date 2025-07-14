import { ImmutableObject } from 'seamless-immutable';

export interface Config {
  useMapWidgetIds: string[];
  // Add default buffer settings if you want later
}

export type IMConfig = ImmutableObject<Config>;
export interface IMConfig {
  useMapWidgetIds: string[];
}