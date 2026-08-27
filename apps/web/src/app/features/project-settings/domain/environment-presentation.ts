import type { EnvironmentState } from '@caselog/schemas';
import type { StatusBadgeTone } from '../../../shared/ui/public-api';
import type { EnvironmentLifecycleAction } from '../data-access/project-environments-api';

export type EnvironmentPresentation = {
  action: EnvironmentLifecycleAction;
  actionLabelKey: string;
  labelKey: string;
  tone: StatusBadgeTone;
};

const ENVIRONMENTS: Record<EnvironmentState, EnvironmentPresentation> = {
  active: {
    action: 'archive',
    actionLabelKey: 'projectSettings.environments.archive',
    labelKey: 'projectSettings.environments.states.active',
    tone: 'success',
  },
  archived: {
    action: 'restore',
    actionLabelKey: 'projectSettings.environments.restore',
    labelKey: 'projectSettings.environments.states.archived',
    tone: 'neutral',
  },
};

export function environmentPresentation(state: EnvironmentState): EnvironmentPresentation {
  return ENVIRONMENTS[state];
}
