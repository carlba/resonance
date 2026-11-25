import { buildCapabilities } from '@/test/fixtures.ts';
import { getDeleteBlockedReason } from './delete-availability.ts';

describe('getDeleteBlockedReason', () => {
  it('has no reason when deleting is possible', () => {
    expect(getDeleteBlockedReason({ capabilities: buildCapabilities() })).toBeUndefined();
  });

  it('tells how to turn on remote file management in slskd', () => {
    const reason = getDeleteBlockedReason({
      capabilities: buildCapabilities({
        canDelete: false,
        unavailableReason: 'file-management-disabled',
      }),
    });

    expect(reason).toContain('SLSKD_REMOTE_FILE_MANAGEMENT=true');
    expect(reason).toContain('remote_file_management: true');
  });

  it('names the destination pattern that cannot be followed', () => {
    const reason = getDeleteBlockedReason({
      capabilities: buildCapabilities({
        canDelete: false,
        unavailableReason: 'unsupported-destination-pattern',
        destinationPattern: '${BATCH_ID}/${SOURCE_DIRECTORY}',
      }),
    });

    expect(reason).toContain('${BATCH_ID}/${SOURCE_DIRECTORY}');
  });

  it('stays blocked while the answer is not known yet', () => {
    expect(getDeleteBlockedReason({})).toMatch(/Checking/);
  });

  it('stays blocked, with the cause, when the answer could not be read', () => {
    expect(getDeleteBlockedReason({ error: new Error('Could not reach the backend') })).toContain(
      'Could not reach the backend'
    );
  });
});
