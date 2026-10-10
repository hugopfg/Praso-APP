/**
 * @typedef {'padaria' | 'restaurante' | 'lanchonete' | 'pizzaria'} ClientSegment
 * @typedef {'ativacao' | 'recompra' | 'em_risco'} VisitGoal
 * @typedef {'feita' | 'proxima' | 'pendente'} VisitStatus
 * @typedef {'cadastro' | 'app' | 'primeiro_pedido' | 'segundo_pedido'} ActivationStepKey
 *
 * @typedef {Object} Seller
 * @property {string} id
 * @property {string} name
 * @property {string} territory
 * @property {string} supervisorPhone
 *
 * @typedef {Object} MonthlyGoal
 * @property {string} month ISO month, for example 2026-10
 * @property {number} points
 * @property {number} target
 * @property {number} expectedToday
 * @property {number} businessDaysLeft
 *
 * @typedef {Object} Visit
 * @property {string} id
 * @property {string} clientId
 * @property {string} scheduledAt ISO timestamp
 * @property {VisitGoal} goal
 * @property {VisitStatus} status
 * @property {number} order
 * @property {string=} note
 * @property {string=} photoDataUrl
 *
 * @typedef {Object} Client
 * @property {string} id
 * @property {string} name
 * @property {ClientSegment} segment
 * @property {number} lat
 * @property {number} lng
 * @property {number|null} daysSinceLastOrder
 * @property {{ordem: number, diasCadastro: number}[]=} comprasAutonomas Registra a ordem e a idade do cadastro quando houve compra autônoma.
 * @property {string=} osmType
 * @property {number=} osmId
 *
 * @typedef {Object} ActivationStep
 * @property {ActivationStepKey} key
 * @property {string} label
 * @property {string|null} doneAt
 *
 * @typedef {Object} Activation
 * @property {string} clientId
 * @property {number} points
 * @property {string} deadline ISO timestamp
 * @property {ActivationStep[]} steps
 * @property {{name: string, qty: string}[]} suggestedBasket
 *
 * @typedef {Object} PrasoFieldMock
 * @property {Seller} seller
 * @property {MonthlyGoal} monthlyGoal
 * @property {Client[]} clients
 * @property {Visit[]} visits
 * @property {Activation[]} activations
 */

export const MOCK_MODEL_VERSION = 1;
