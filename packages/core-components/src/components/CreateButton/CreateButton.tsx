/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import AddCircleOutline from '@material-ui/icons/AddCircleOutline';
import React from 'react';
import { LinkProps } from 'react-router-dom';
import { ResponsiveIconButton } from '../ResponsiveIconButton';

/**
 * Properties for {@link CreateButton}
 *
 * @public
 */
export type CreateButtonProps = {
  title: string;
} & Partial<Pick<LinkProps, 'to'>>;

/**
 * "Create new component" button for the catalog. Responsive to display only an icon for small
 * screens.
 *
 * @public
 */
export function CreateButton(props: CreateButtonProps) {
  return (
    <ResponsiveIconButton
      variant="contained"
      color="primary"
      icon={<AddCircleOutline />}
      {...props}
    />
  );
}
