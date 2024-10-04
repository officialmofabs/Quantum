import { Response, NextFunction, RequestHandler } from 'express';
import { IRequest } from '@typings/controllers/common';
import { Document, Model } from 'mongoose';
import { catchAsync, filterObject, checkIfSlugOrId } from '@utilities/helpers';
import { IUser } from '@typings/models/user';
import type {
    HandlerFactoryOptions, 
    MiddlewareFunction, 
    HandlerFactoryMethodConfig } from '@typings/controllers/handlerFactory';
import APIFeatures from '@utilities/apiFeatures';
import RuntimeError from '@utilities/runtimeError';

class HandlerFactory{
    private model: Model<any>;
    private fields: string[];

    constructor({ model, fields = [] }: HandlerFactoryOptions){
        this.model = model;
        this.fields = fields;
    }

    private async applyMiddlewares(
        middlewares: MiddlewareFunction[] = [], 
        req: IRequest, 
        data: any
    ): Promise<any>{
        let result = data;
        for(const middleware of middlewares){
            result = await middleware(req, result);
        }
        return result;
    }

    private createHandler(
        operation: (req: IRequest, res: Response, next: NextFunction) => Promise<void>,
        config: HandlerFactoryMethodConfig = {}
    ) : RequestHandler{
        return catchAsync(async (req: IRequest, res: Response, next: NextFunction) => {
            req.handlerData = await this.applyMiddlewares(config.middlewares.pre, req, req.body);
            await operation(req, res, next);
            if(res.locals.data){
                res.locals.data = await this.applyMiddlewares(config.middlewares.post, req, res.locals.data);
            }
        });
    }

    deleteOne(config: HandlerFactoryMethodConfig): RequestHandler{
        return this.createHandler(async (req, res, next) => {
            const query = checkIfSlugOrId(req.params.id);
            const record = await this.model.findOneAndDelete(query);
            if(!record){
                return next(new RuntimeError('Core::DeleteOne::RecordNotFound', 404));
            }
            res.locals.data = record;
            res.status(204).json({
                status: 'success',
                data: record
            });
        }, config);
    }

    updateOne(config: HandlerFactoryMethodConfig): RequestHandler{
        return this.createHandler(async (req, res, next) => {
            const query = this.createQuery(req);
            const record = await this.model.findOneAndUpdate(
                checkIfSlugOrId(req.params.id),
                query,
                { new: true, runValidators: true });
            if(!record){
                return next(new RuntimeError('Core::UpdateOne::RecordNotFound', 404));
            }
            res.locals.data = record;
            res.status(200).json({
                status: 'success',
                data: record
            });
        }, config);
    }

    private createQuery(req: IRequest): object{
        const query = filterObject(req.body, ...this.fields);
        // Via API, through the body you can send the user's 'id' to establish 
        // the relationship. This is unsafe. Only users with the 'admin' role can
        // do this. Otherwise, it is automatically assigned to the authenticated user's ID.
        if(this.fields.includes('user') && req.user){
            const authenticatedUser = req.user as IUser;
            if(authenticatedUser.role === 'admin' && req.body?.user){
                query.user = req.body.user;
            }else{
                query.user = authenticatedUser._id;
            }
        }
        return query;
    }

    createOne(config: HandlerFactoryMethodConfig): RequestHandler{
        return this.createHandler(async (req, res) => {
            const query = this.createQuery(req);
            const record = await this.model.create(query);
            res.locals.data = record;
            res.status(201).json({
                status: 'success',
                data: record
            });
        }, config);
    }

    private getPopulateFromRequest(query: IRequest['query']): string | null{
        if(!query?.populate) return null;
        const populate = query.populate as string;
        console.log(populate);
        return populate.startsWith('{')
            ? JSON.parse(populate).join(' ')
            : populate.split(',').join(' ');
    }

    getAll(config: HandlerFactoryMethodConfig): RequestHandler{
        return this.createHandler(async (req, res) => {
            const populate = this.getPopulateFromRequest(req.query);
            const operations = new APIFeatures({
                requestQueryString: req.query,
                model: this.model,
                fields: this.fields,
                populate
            }).filter().sort().limitFields().search();
            await operations.paginate();
            const { records, skippedResults, totalResults, page, limit, totalPages } = await operations.perform();
            res.locals.data = records;
            res.status(200).json({
                status: 'success',
                page: {
                    current: page,
                    total: totalPages
                },
                results: {
                    skipped: skippedResults,
                    total: totalResults,
                    paginated: limit
                },
                data: records
            });
        }, config);
    }

    getOne(config: HandlerFactoryMethodConfig): RequestHandler{
        return this.createHandler(async (req, res, next) => {
            const populate = this.getPopulateFromRequest(req.query);
            let record: Document<any, {}> | null = await this.model.findOne(checkIfSlugOrId(req.params.id));
            if(!record){
                return next(new RuntimeError('Core::GetOne::RecordNotFound', 404));
            }
            if(populate) record = await record.populate(populate);
            res.locals.data = record;
            res.status(200).json({
                status: 'success',
                data: record
            });
        }, config)
    }
}

export default HandlerFactory;