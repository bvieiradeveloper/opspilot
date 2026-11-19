export class DomainError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

export class InvalidDomainInputError extends DomainError {}

export class UnknownServiceError extends DomainError {}

export class UnknownIncidentError extends DomainError {}

export class IncidentAlreadyResolvedError extends DomainError {}

export class UnknownStrategyError extends DomainError {}

export class UnknownConversationError extends DomainError {}

export class RequestNotFoundError extends DomainError {}

export class ConversationSummarizationError extends DomainError {}

export class ModelUnavailableError extends DomainError {
    constructor() {
        super("All configured models are unavailable.");
    }
}