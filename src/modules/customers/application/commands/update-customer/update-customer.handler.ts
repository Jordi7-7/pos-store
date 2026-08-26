import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UpdateCustomerCommand } from './update-customer.command';
import { Customer } from '../../../domain/entities/customer.entity';

@CommandHandler(UpdateCustomerCommand)
export class UpdateCustomerHandler implements ICommandHandler<UpdateCustomerCommand> {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async execute(command: UpdateCustomerCommand): Promise<Customer> {
    const { tenantId, id, dto } = command;

    const customer = await this.customerRepository.findOne({
      where: { id, tenantId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    if (dto.identityNumber !== undefined) {
      const existing = await this.customerRepository.findOne({
        where: { tenantId, identityNumber: dto.identityNumber, id: Not(id) },
      });
      if (existing) {
        throw new BadRequestException(`Customer with identity number ${dto.identityNumber} already exists`);
      }
      customer.identityNumber = dto.identityNumber;
    }

    if (dto.name !== undefined) {
      customer.name = dto.name;
    }
    if (dto.email !== undefined) {
      customer.email = dto.email;
    }
    if (dto.phone !== undefined) {
      customer.phone = dto.phone;
    }

    return this.customerRepository.save(customer);
  }
}
