import { randomUUID } from 'expo-crypto';

import { createNativeRepository } from '../storage/nativeRepository';
import { ProjectStore } from './ProjectStore';

export const newId = (): string => randomUUID();
// Outside the render subtree so explicit render retry retains pending intent.
export const projectStore = new ProjectStore(createNativeRepository(), newId);
