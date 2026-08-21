import { AgentAuthorization } from '../../../database/models/agent-authorization.model';
import { SequelizeAgentAccessRepository } from './sequelize-agent-access.repository';

describe('SequelizeAgentAccessRepository', () => {
    afterEach(() => jest.restoreAllMocks());

    it('uses a row lock for one-time credential reads inside a transaction', async () => {
        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const sequelize = { transaction: jest.fn((callback) => callback(transaction)) };
        const authorization = jest.spyOn(AgentAuthorization, 'findOne').mockResolvedValue(null);
        const repository = new SequelizeAgentAccessRepository(sequelize as never);

        await repository.transaction((scoped) => scoped.authorizationByCodeHash('code-hash', true));

        expect(sequelize.transaction).toHaveBeenCalledTimes(1);
        expect(authorization).toHaveBeenCalledWith({
            where: { authorizationCodeHash: 'code-hash' },
            transaction,
            lock: 'UPDATE',
        });
    });
});
