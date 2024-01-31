// Copyright 2020-2024 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  GraphQLEntityField,
  GraphQLEntityIndex,
  GraphQLEnumsType,
  GraphQLModelsType,
  GraphQLRelationsType,
} from '@subql/utils';

export interface SchemaChangesType {
  addedModels: GraphQLModelsType[];
  removedModels: GraphQLModelsType[];

  modifiedModels: Record<
    string,
    {
      model: GraphQLModelsType;
      addedFields: GraphQLEntityField[];
      removedFields: GraphQLEntityField[];

      addedIndexes: GraphQLEntityIndex[];
      removedIndexes: GraphQLEntityIndex[];
    }
  >;

  addedRelations: GraphQLRelationsType[];
  removedRelations: GraphQLRelationsType[];

  addedEnums: GraphQLEnumsType[];
  removedEnums: GraphQLEnumsType[];
  allEnums: GraphQLEnumsType[];
}

export function indexesEqual(index1: GraphQLEntityIndex, index2: GraphQLEntityIndex): boolean {
  return (
    index1.fields.join(',') === index2.fields.join(',') &&
    index1.unique === index2.unique &&
    index1.using === index2.using
  );
}

export function hasChanged(changes: SchemaChangesType): boolean {
  return Object.values(changes).some((change) =>
    Array.isArray(change) ? change.length > 0 : Object.keys(change).length > 0
  );
}

export function compareEnums(
  currentEnums: GraphQLEnumsType[],
  nextEnums: GraphQLEnumsType[],
  changes: SchemaChangesType
): void {
  const currentEnumNames = new Set(currentEnums.map((e) => e.name));
  const nextEnumNames = new Set(nextEnums.map((e) => e.name));

  changes.addedEnums = nextEnums.filter((e) => !currentEnumNames.has(e.name));
  changes.removedEnums = currentEnums.filter((e) => !nextEnumNames.has(e.name));
}

export function compareRelations(
  currentRelations: GraphQLRelationsType[],
  nextRelations: GraphQLRelationsType[],
  changes: SchemaChangesType
): void {
  const relationKey = (relation: GraphQLRelationsType) =>
    `${relation.from}-${relation.to}-${relation.type}-${relation.foreignKey}`;

  const currentRelationsMap = new Map(currentRelations.map((rel) => [relationKey(rel), rel]));
  const nextRelationsMap = new Map(nextRelations.map((rel) => [relationKey(rel), rel]));

  nextRelations.forEach((rel) => {
    if (!currentRelationsMap.has(relationKey(rel))) {
      changes.addedRelations.push(rel);
    }
  });

  currentRelations.forEach((rel) => {
    if (!nextRelationsMap.has(relationKey(rel))) {
      changes.removedRelations.push(rel);
    }
  });

  nextRelations.forEach((nextRel) => {
    const currentRel = currentRelations.find(
      (currentRel) =>
        currentRel.from === nextRel.from && currentRel.to === nextRel.to && currentRel.type === nextRel.type
    );

    if (currentRel && currentRel.foreignKey !== nextRel.foreignKey) {
      // TODO handle modified relations
    }
  });
}

export function fieldsAreEqual(field1: GraphQLEntityField, field2: GraphQLEntityField): boolean {
  return (
    field1.name === field2.name &&
    field1.type === field2.type &&
    field1.nullable === field2.nullable &&
    field1.isArray === field2.isArray
  );
}

export function compareModels(
  currentModels: GraphQLModelsType[],
  nextModels: GraphQLModelsType[],
  changes: SchemaChangesType
): void {
  const currentModelsMap = new Map(currentModels.map((model) => [model.name, model]));
  const nextModelsMap = new Map(nextModels.map((model) => [model.name, model]));

  currentModels.forEach((model) => {
    if (!nextModelsMap.has(model.name)) {
      changes.removedModels.push(model);
    }
  });

  nextModels.forEach((model) => {
    if (!currentModelsMap.has(model.name)) {
      changes.addedModels.push(model);
    }
  });

  nextModels.forEach((model) => {
    const currentModel = currentModelsMap.get(model.name);
    if (currentModel) {
      const addedFields = model.fields.filter((field) => !currentModel.fields.some((f) => fieldsAreEqual(f, field)));
      const removedFields = currentModel.fields.filter((field) => !model.fields.some((f) => fieldsAreEqual(f, field)));

      const addedIndexes = model.indexes.filter((index) => !currentModel.indexes.some((i) => indexesEqual(i, index)));
      const removedIndexes = currentModel.indexes.filter((index) => !model.indexes.some((i) => indexesEqual(i, index)));

      if (addedFields.length || removedFields.length || addedIndexes.length || removedIndexes.length) {
        changes.modifiedModels[model.name] = {
          model,
          addedFields,
          removedFields,
          addedIndexes,
          removedIndexes,
        };
      }
    }
  });
}

export function schemaChangesLoggerMessage(schemaChanges: SchemaChangesType): string {
  let logMessage = '\n';

  const formatModels = (models: GraphQLModelsType[]) => models.map((model: GraphQLModelsType) => model.name).join(', ');
  const formatIndexes = (indexes: GraphQLEntityIndex[]) =>
    indexes
      .map(
        (index: GraphQLEntityIndex) =>
          `${index.fields.join(', ')}${index.unique ? ' (Unique)' : ''}${index.using ? ` Using: ${index.using}` : ''}`
      )
      .join('; ');

  if (schemaChanges.addedModels.length) {
    logMessage += `Added Entities: ${formatModels(schemaChanges.addedModels)}\n`;
  }

  if (schemaChanges.removedModels.length) {
    logMessage += `Removed Entities: ${formatModels(schemaChanges.removedModels)}\n`;
  }

  Object.entries(schemaChanges.modifiedModels).forEach(([modelName, changes]) => {
    logMessage += `Modified Entities: ${modelName}\n`;

    if (changes.addedFields.length) {
      logMessage += `\tAdded Fields: ${changes.addedFields.map((field) => field.name).join(', ')}\n`;
    }
    if (changes.removedFields.length) {
      logMessage += `\tRemoved Fields: ${changes.removedFields.map((field) => field.name).join(', ')}\n`;
    }

    if (changes.addedIndexes.length) {
      logMessage += `\tAdded Indexes: ${formatIndexes(changes.addedIndexes)}\n`;
    }
    if (changes.removedIndexes.length) {
      logMessage += `\tRemoved Indexes: ${formatIndexes(changes.removedIndexes)}\n`;
    }
  });

  /*
     // Adding relations
    if (schemaChanges.addedRelations.length) {
      logMessage += `Added Relations: ${formatModels(schemaChanges.addedRelations)}\n`;
    }

    // Removing relations
    if (schemaChanges.removedRelations.length) {
      logMessage += `Removed Relations: ${formatModels(schemaChanges.removedRelations)}\n`;
    }

    // Adding enums
    if (schemaChanges.addedEnums.length) {
      logMessage += `Added Enums: ${formatModels(schemaChanges.addedEnums)}\n`;
    }

    // Removing enums
    if (schemaChanges.removedEnums.length) {
      logMessage += `Removed Enums: ${formatModels(schemaChanges.removedEnums)}\n`;
    }
     */
  return logMessage;
}
