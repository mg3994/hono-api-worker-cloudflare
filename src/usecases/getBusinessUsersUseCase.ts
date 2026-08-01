import { ICompanyRepository, CompanyUserRoleRecord } from '../domain/companyRepository';

export class GetBusinessUsersUseCase {
  private companyRepo: ICompanyRepository;

  constructor(companyRepo: ICompanyRepository) {
    this.companyRepo = companyRepo;
  }

  /**
   * Retrieves all users (emails, roles) mapped to a specific business ID from D1.
   */
  public async execute(businessId: string): Promise<CompanyUserRoleRecord[]> {
    if (!businessId) {
      throw new Error('Business ID is required.');
    }
    return this.companyRepo.getBusinessUsers(businessId);
  }
}
