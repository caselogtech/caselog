import { environmentPresentation } from '../../domain/environment-presentation';

describe('environmentPresentation', () => {
  it('maps every lifecycle state to its label, tone, and legal action', () => {
    expect(environmentPresentation('active')).toEqual({
      action: 'archive',
      actionLabelKey: 'projectSettings.environments.archive',
      labelKey: 'projectSettings.environments.states.active',
      tone: 'success',
    });
    expect(environmentPresentation('archived')).toEqual({
      action: 'restore',
      actionLabelKey: 'projectSettings.environments.restore',
      labelKey: 'projectSettings.environments.states.archived',
      tone: 'neutral',
    });
  });
});
